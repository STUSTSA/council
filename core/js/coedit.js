/* 核心｜跨部門共編（2026-11-23；規則與資料：docs/architecture/permissions.md「跨部門共編」，資料讀寫在 coedit-fs.js）
   卡片的 co＝{invite, ask, depts}：誰都不能單方面把部門加進共編，一定是「另一邊」的部門管理員同意：
   - 主要部門（卡片所屬部門）的部長／處長／會長（管理員與總管理員）按卡片上的「共編」勾選要邀請的部門 → 對方部門管理員在自己的即時回報頁「共編」區按同意。
   - 會長（會長室）在別的部門的卡片按「申請共編」（coAskBtnHTML，會長收藏的卡片用）→ 該卡主要部門的管理員在「共編」區按同意（會長用同一套，不能繞過）。
   同意之後，對方部門的編輯者在「共編」區按「編輯」，只能改名稱與逐行內容（時間標記、專員、標籤、完成、刪除都不行）；任何一邊隨時能收回、退出。
   只有進行中的卡片能共編；畫面插入的文字一律 esc。 */
const CO={key:"",data:undefined,loading:false,busy:false,html:null};
const coMod=()=>storeModLoad("coedit-fs.js","board-coedit-ready","BoardCoedit");
const coSee=()=>fsMode()&&deptSourceOf(CFG.deptId)==="firestore"&&!!storeFsBase&&fsWriter();
/* 這個部門的管理員（會長室的總管理員代表會長室）：能替自己的部門同意、婉拒、退出 */
const coMyAdmin=()=>!!(acct.user&&(acctDepts()[CFG.deptId]==="admin"||(CFG.deptId==="president"&&acctSuper())));
const coName=d=>{const x=BOARD_DEPTS.find(y=>y.id===d);return x?x.name:d};
const coErr=e=>e&&e.code==="permission-denied"?"沒有權限，沒有變更":e&&e.code==="gone"?"這張卡片已經變了（完成、刪除或對方已處理），請重新整理":e&&e.code==="conflict"?"這張卡片剛被別人改過，請重新整理再改":"沒有成功，請稍後再試";
const coWait=()=>{if(editing||CO.busy){toast("請先儲存或取消編輯目前的卡片");return true}return false};
/* ---- 資料 ---- */
async function coLoad(){
  if(CO.loading)return;CO.loading=true;
  try{CO.data=await (await coMod()).mine(CFG.firebase,CFG.deptId)}catch(e){console.error("共編讀取失敗",e);CO.data={invites:[],shared:[],asked:[]}}
  CO.loading=false;renderCo(true);
}
/* 這個部門自己的卡片被別的部門申請共編（讀進來的部門資料裡就有，不另外查） */
const coAsksOnMine=()=>(storeFsBase&&storeFsBase.src.cards||[]).filter(c=>c.state==="open"&&c.co&&(c.co.ask||[]).length)
  .flatMap(c=>c.co.ask.map(d=>({id:c.id,title:c.title,dept:d})));
/* ---- 畫面：即時回報頁上面的「共編」卡（沒有任何事項就整張不顯示） ---- */
function renderCo(force){
  const p=$("#coPanel");if(!p)return;
  const key=`${typeof acct!=="undefined"&&acct.user?acct.user.uid:""}|${coSee()}`;
  if(!coSee()){p.hidden=true;if(CO.key!==key){CO.key=key;CO.data=undefined}return}
  if(CO.key!==key){CO.key=key;CO.data=undefined;coLoad();return}
  if(CO.data===undefined){p.hidden=true;return}
  const adm=coMyAdmin(),dis=CO.busy?" disabled":"",btn=(k,t,cls)=>`<button type="button" class="${cls||"icon"}" data-co="${k}"${dis}>${t}</button>`;
  const rows=[
    ...CO.data.invites.map(c=>({id:c.id,m:`${coName(c.deptId)} 邀請你們共編`,t:c.title,a:adm?btn("accept","同意共編","primary")+btn("decline","婉拒"):""})),
    ...coAsksOnMine().map(x=>({id:x.id,d:x.dept,m:`${coName(x.dept)} 申請共編這張卡片`,t:x.title,a:fsAdmin()?btn("grant","同意","primary")+btn("deny","拒絕"):""})),
    ...CO.data.shared.map(c=>({id:c.id,m:`共編中・來自${coName(c.deptId)}`,t:c.title,a:btn("edit","編輯","primary")+(adm?btn("leave","退出"):"")})),
    ...CO.data.asked.map(c=>({id:c.id,m:`已向${coName(c.deptId)}申請共編，等對方同意`,t:c.title,a:adm?btn("withdraw","撤回申請"):""}))];
  p.hidden=!rows.length;if(p.hidden)return;
  const h=rows.map(r=>`<div class="mp-row" data-coid="${esc(r.id)}"${r.d?` data-cod="${esc(r.d)}"`:""}><p class="mp-meta">${esc(r.m)}</p><p class="mp-note">${esc(r.t)}</p>${r.a?`<div class="mp-act">${r.a}</div>`:""}</div>`).join("");
  if(h!==CO.html||force){CO.html=h;$("#coList").innerHTML=h}
  $("#coCnt").textContent=`${rows.length} 項`;
}
/* ---- 動作：每一步只動一個部門（規則要求），改完重新讀 ---- */
const coFix={
  accept:(co,x)=>co.invite.includes(x)?{...co,invite:co.invite.filter(y=>y!==x),depts:[...co.depts,x]}:null,
  decline:(co,x)=>co.invite.includes(x)?{...co,invite:co.invite.filter(y=>y!==x)}:null,
  leave:(co,x)=>co.depts.includes(x)?{...co,depts:co.depts.filter(y=>y!==x)}:null,
  withdraw:(co,x)=>co.ask.includes(x)?{...co,ask:co.ask.filter(y=>y!==x)}:null,
  grant:(co,x)=>co.ask.includes(x)?{...co,ask:co.ask.filter(y=>y!==x),depts:[...co.depts,x]}:null,
  deny:(co,x)=>co.ask.includes(x)?{...co,ask:co.ask.filter(y=>y!==x)}:null,
  invite:(co,x)=>!co.invite.includes(x)&&!co.ask.includes(x)&&!co.depts.includes(x)?{...co,invite:[...co.invite,x]}:null,
  ask:(co,x)=>!co.invite.includes(x)&&!co.ask.includes(x)&&!co.depts.includes(x)?{...co,ask:[...co.ask,x]}:null,
  drop:(co,x)=>({invite:co.invite.filter(y=>y!==x),ask:co.ask.filter(y=>y!==x),depts:co.depts.filter(y=>y!==x)})};
async function coRun(steps,msg){
  CO.busy=true;renderCo(true);
  let ok=false;
  try{
    const M=await coMod();
    for(const [cid,k,x] of steps)await M.step(CFG.firebase,cid,co=>coFix[k](co,x));
    ok=true;if(msg)toast(msg);
  }catch(e){console.error(e);toast(coErr(e))}
  /* 自己部門的卡片（邀請、申請的結果）重新讀進來；正在編輯就只更新共編區，免得把編輯中的畫面換掉 */
  try{if(!editing){storeFsUse(await storeFsLoad(true));render()}}catch(e){console.error(e)}
  CO.busy=false;coLoad();
  return ok;
}
document.addEventListener("click",async e=>{
  const b=e.target.closest&&e.target.closest("#coPanel [data-co]");if(!b||b.disabled||coWait())return;
  const r=b.closest("[data-coid]"),cid=r.dataset.coid,k=b.dataset.co,mine=CFG.deptId;
  if(k==="edit"){coEdit(cid);return}
  if(k==="grant"||k==="deny"){await coRun([[cid,k,r.dataset.cod]],k==="grant"?"已同意，對方部門可以一起改這張卡片":"已拒絕");return}
  await coRun([[cid,k,mine]],{accept:"已同意，部門的編輯者可以在「共編」區一起改",decline:"已婉拒",leave:"已退出共編",withdraw:"已撤回申請"}[k]);
});
/* ---- 主要部門：卡片上的「共編」鈕（部長／處長／會長）：勾選要邀請的部門；取消勾選＝收回；對方申請中的勾選＝同意 ---- */
const coCardRaw=id=>storeFsBase&&(storeFsBase.src.cards||[]).find(c=>c.id===StoreMap.nid(CFG.deptId,id));
function coBtnHTML(ev){
  if(!fsMode()||!storeFsBase||!fsAdmin()||ev.doneAt)return "";
  const c=coCardRaw(ev.id);if(!c)return "";
  const co=c.co||{},n=(co.invite||[]).length+(co.ask||[]).length+(co.depts||[]).length;
  return `<button type="button" class="co-btn" data-coshare="${esc(ev.id)}" aria-pressed="${!!n}">共編${n?` ${n}`:""}</button>`;
}
async function coShare(id){
  if(coWait())return;
  const c=coCardRaw(id),ev=state.events.find(e=>e.id===id);if(!c||!ev)return;
  const co=c.co||{},inv=co.invite||[],asks=co.ask||[],dp=co.depts||[],cur=[...inv,...asks,...dp];
  const opts=BOARD_DEPTS.filter(d=>d.id!==CFG.deptId&&(!d.test||CFG.test)).map(d=>[d.id,d.name+(dp.includes(d.id)?"（共編中）":inv.includes(d.id)?"（已邀請，等對方同意）":asks.includes(d.id)?"（對方申請，勾著＝同意）":"")]);
  const v=await ask("共編："+ev.name,[{name:"depts",label:"勾選的部門可以一起改這張卡片的名稱與內容；對方部門的部長同意後才生效，取消勾選＝收回",type:"multi",options:opts,value:cur}],{note:"共編的人不能改時間標記、專員、標籤，也不能完成或刪除這張卡片。"});
  if(!v)return;
  const want=v.depts||[],steps=[];
  want.filter(x=>!cur.includes(x)).forEach(x=>steps.push([c.id,"invite",x]));
  want.filter(x=>asks.includes(x)).forEach(x=>steps.push([c.id,"grant",x]));
  cur.filter(x=>!want.includes(x)).forEach(x=>steps.push([c.id,"drop",x]));
  if(!steps.length)return;
  await coRun(steps,"共編設定已更新");
}
/* ---- 會長：在別的部門的卡片申請共編（會長收藏的卡片用；dept＝卡片所屬部門、cid＝卡片的文件 ID、title＝名稱） ---- */
const coAskOk=dept=>CFG.deptId==="president"&&dept!=="president"&&deptSourceOf("president")==="firestore"&&!!acct.user&&(acctSuper()||acctDepts().president==="admin");
function coAskBtnHTML(dept,cid,title){
  return coAskOk(dept)?`<button type="button" class="co-btn" data-coask="${esc(cid)}" data-cod="${esc(dept)}" data-cot="${esc(String(title).slice(0,100))}">申請共編</button>`:"";
}
document.addEventListener("click",async e=>{
  const b=e.target.closest&&e.target.closest("[data-coask]");if(!b||coWait())return;
  const dept=b.dataset.cod,cid=b.dataset.coask;if(!coAskOk(dept))return;
  if(await ask("申請共編",[],{danger:"送出申請",note:`向${coName(dept)}申請一起改「${b.dataset.cot}」。\n${coName(dept)}的部長同意後，你才能在「共編」區改它的名稱與內容。`})!=="delete")return;
  await coRun([[cid,"ask","president"]],`已向${coName(dept)}申請，等對方同意`);
});
/* ---- 共編的人改卡片：名稱與逐行內容；時間行（共編不能改）留在原位 ---- */
async function coEdit(cid){
  const c=(CO.data&&CO.data.shared||[]).find(x=>x.id===cid);if(!c)return;
  const dept=c.deptId,all=StoreMap.fromFsBlocks(dept,c.blocks),free=all.filter(b=>!b.timeId),timed=all.map((b,i)=>[i,b]).filter(([,b])=>b.timeId);
  const v=await ask("共編："+c.title,[{name:"title",label:"名稱",value:c.title},{name:"desc",label:"內容（一行一項；開頭「☐ 」是待辦、「☑ 」是已完成）",type:"textarea",rows:10,value:free.map(StoreMap.lineOf).join("\n")}],
    {wide:true,note:`這張卡片屬於${coName(dept)}${timed.length?`；有 ${timed.length} 行時間標記，共編不能改，會留在原位`:""}。`,
      validate:o=>!o.title.trim()?"名稱不能空白":o.title.length>500?"名稱最多 500 字":String(o.desc).split("\n").some(l=>l.length>StoreMap.TXT_MAX)?`每行最多 ${StoreMap.TXT_MAX} 字`:String(o.desc).split("\n").filter(Boolean).length+timed.length>StoreMap.BLK_MAX?`最多 ${StoreMap.BLK_MAX} 行`:""});
  if(!v)return;
  const lines=StoreMap.blocksFromDesc(String(v.desc).split("\n").filter(l=>l.trim()!=="").join("\n"),free);
  timed.forEach(([i,b])=>lines.splice(Math.min(i,lines.length),0,b));
  const blocks=StoreMap.blocksOf({blocks:lines,times:(c.timeIds||[]).map(x=>({id:StoreMap.oid(dept,x)}))}),fs={id:blocks.map(b=>b.id),text:blocks.map(b=>b.text),check:blocks.map(b=>b.check),time:blocks.map(b=>b.timeId?StoreMap.nid(dept,b.timeId):null)};
  CO.busy=true;renderCo(true);
  try{await (await coMod()).saveCard(CFG.firebase,cid,c.version,v.title.trim(),fs);toast("已儲存，原部門看得到這次修改")}catch(e){console.error(e);toast(coErr(e))}
  CO.busy=false;coLoad();
}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-coshare]");if(b)coShare(b.dataset.coshare)});
