/* 核心｜會議結論的待合併提案（2026-11-21；規則與資料：docs/architecture/permissions.md 第 5.1k 節，資料讀寫在 proposals-fs.js）
   兩端：
   - 秘書處：行政會議文件（meeting.js 的 #agDoc）每個部門段落有「送到部門等待合併」＝把那個部門的卡片結論與臨時項目送成提案（mpSend）。
     只能送給已搬到新資料庫的部門；同一個結論重送＝更新還沒處理的、部門已處理的不再動。秘書處不會動到對方的卡片。
   - 部門：即時回報頁最上面的「會議結論」卡（#mpPanel）：還沒處理的提案一則一列；「合併」＝照一般儲存把結論加成那張卡片的最後一行
     （臨時項目＝建成新卡片），成功後才把提案標成已合併；「略過」＝標成略過。只有該部門的編輯者以上看得到（規則同樣擋）。
   畫面插入的文字一律 esc。 */
const MP={key:"",list:undefined,loading:false,busy:false,html:null};
const mpMod=()=>storeModLoad("proposals-fs.js","board-proposals-ready","BoardProposals");
const mpSee=()=>fsMode()&&deptSourceOf(CFG.deptId)==="firestore"&&!!storeFsBase&&fsWriter();
const mpErr=e=>e&&e.code==="permission-denied"?"沒有權限，沒有變更":"沒有成功，請稍後再試";
const mpMD=d=>String(d||"").slice(5).replace("-","/");
const mpLine=p=>`會議結論（${mpMD(p.meetingDate)}）：${String(p.note).replace(/\s*\n\s*/g," ")}`.slice(0,StoreMap.TXT_MAX);
const mpCard=p=>state.events.find(e=>StoreMap.nid(CFG.deptId,e.id)===p.cardId);
/* ---- 部門端 ---- */
async function mpLoad(){
  if(MP.loading)return;MP.loading=true;
  try{MP.list=await (await mpMod()).pending(CFG.firebase,CFG.deptId)}catch(e){console.error("待合併讀取失敗",e);MP.list=[]}
  MP.loading=false;renderProposals(true);
}
function renderProposals(force){
  const p=$("#mpPanel");if(!p)return;
  const key=`${typeof acct!=="undefined"&&acct.user?acct.user.uid:""}|${mpSee()}`;
  if(!mpSee()){p.hidden=true;if(MP.key!==key){MP.key=key;MP.list=undefined}return}
  if(MP.key!==key){MP.key=key;MP.list=undefined;mpLoad();return}
  if(MP.list===undefined){p.hidden=true;return}
  p.hidden=!MP.list.length;if(p.hidden)return;
  const h=MP.list.map(x=>{const c=x.kind==="note"?mpCard(x):null,label=x.kind==="new"?`新項目：${x.title}`:(c?c.name:x.title);
    return `<div class="mp-row" data-mpid="${esc(x.id)}"><p class="mp-meta">${esc(mpMD(x.meetingDate))} 行政會議　${esc(label)}</p><p class="mp-note">${esc(x.note)}</p>
      <div class="mp-act"><button type="button" class="primary" data-mp="merge"${MP.busy?" disabled":""}>${x.kind==="new"?"建成新卡片":"合併到卡片"}</button><button type="button" class="icon" data-mp="skip"${MP.busy?" disabled":""}>略過</button></div></div>`}).join("");
  if(h!==MP.html||force){MP.html=h;$("#mpList").innerHTML=h}
  $("#mpCnt").textContent=`${MP.list.length} 則待合併`;
}
async function mpMerge(id){
  const p=(MP.list||[]).find(x=>x.id===id);if(!p||MP.busy)return;
  const line=()=>({id:uid("b"),text:mpLine(p),check:null,timeId:null});
  MP.busy=true;renderProposals(true);
  let ok=false;
  try{
    if(p.kind==="note"){
      const ev=mpCard(p);
      if(!ev||ev.doneAt)toast("找不到這張卡片（已完成或刪除），可以按「略過」");
      else if(ev.blocks.length>=StoreMap.BLK_MAX)toast(`這張卡片已經有 ${StoreMap.BLK_MAX} 行，請先整理再合併`);
      else ok=await settingSave(()=>{ev.blocks.push(line());evTouch(ev);kpSync(ev)},"已合併到卡片");
    }else ok=await settingSave(()=>{const ev={id:uid("e"),name:(p.title||"臨時項目").slice(0,100),desc:"",blocks:[line()],createdAt:today(),staff:[],links:[],times:[],round:1,touched:[]};evTouch(ev);kpSync(ev);state.events.push(ev)},"已建成新卡片");
    if(ok){try{await (await mpMod()).resolve(CFG.firebase,id,"merged")}catch(e){console.error(e);toast("卡片已更新，但提案沒有標成已合併，請按「略過」收起")}MP.list=MP.list.filter(x=>x.id!==id)}
  }catch(e){console.error(e);toast(mpErr(e))}
  MP.busy=false;renderProposals(true);
}
async function mpSkip(id){
  if(MP.busy)return;MP.busy=true;renderProposals(true);
  try{await (await mpMod()).resolve(CFG.firebase,id,"dismissed");MP.list=MP.list.filter(x=>x.id!==id);toast("已略過")}catch(e){console.error(e);toast(mpErr(e))}
  MP.busy=false;renderProposals(true);
}
document.addEventListener("click",e=>{
  const b=e.target.closest&&e.target.closest("#mpPanel [data-mp]");if(!b||b.disabled)return;
  const id=b.closest("[data-mpid]").dataset.mpid;
  if(b.dataset.mp==="merge")mpMerge(id);else mpSkip(id);
});
/* ---- 秘書處端：把會議紀錄裡某個部門的結論送出（it＝AG.doc.items 的一項）→ 送出的項數，失敗或沒東西回 0 ---- */
async function mpSend(it){
  if(!fsMode()||deptSourceOf(it.dept)!=="firestore"){toast(`${it.deptName}還在舊資料，沒辦法送到待合併`);return 0}
  const data=mnData(it.dept),date=AG.doc.date,rid=s=>`${date}__${it.dept}__${String(s).replace(/[^A-Za-z0-9_-]/g,"_").slice(0,60)}`,rows=[];
  Object.entries(it.notes||{}).forEach(([evId,v])=>{const note=String(v).trim(),e=data&&data.events.find(x=>x.id===evId);
    if(note&&e)rows.push({id:rid(evId),deptId:it.dept,cardId:StoreMap.nid(it.dept,evId),kind:"note",title:String(e.name).slice(0,100),note:note.slice(0,1000),meetingDate:date})});
  (it.extra||[]).forEach(x=>{const title=String(x.title||"").trim(),note=String(x.note||"").trim()||title;
    if(note)rows.push({id:rid(x.id),deptId:it.dept,cardId:null,kind:"new",title:title||"臨時項目",note:note.slice(0,1000),meetingDate:date})});
  if(!rows.length){toast("還沒有結論可以送");return 0}
  try{
    const r=await (await mpMod()).send(CFG.firebase,rows),n=r.created+r.updated;
    toast(`已送出 ${n} 項到${it.deptName}，等部門合併${r.skipped?`（另有 ${r.skipped} 項部門已處理過，沒有更新）`:""}`);return n;
  }catch(e){console.error(e);toast(mpErr(e));return 0}
}
