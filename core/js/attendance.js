/* 核心｜點名，秘書處端（07，docs/architecture/data-model.md 第 5 節；設定檔 meeting:true 的秘書處看板、firestore 模式）
   「會議」分頁的一張卡片 #attPanel：
   - 名冊：「匯入名冊」貼上一行一人（部門 職稱 姓名）。名冊由秘書處自己維護，不從帳號帶（帳號的角色不是會議出席名單）；已有的（同部門同姓名）略過，不會重複。
   - 整理名冊：「名冊」列出全部人（部門＋姓名），取消勾選＝停用（不再出現在點名；過去的紀錄還在），勾回來＝恢復。不刪文件。
   - 複製結果：「複製結果」把這一場的出席數與請假、缺席、還沒點的名單複製成文字。
   - 場次：「+ 場次」新增一次點名（名稱＋日期）；上面一排場次膠囊（最近 40 場，新的在前），一次點一場。
   - 點名：每個人一顆按鈕，點一下依序換 出席→請假→缺席→出席（實心＝出席、外框＝請假、斜紋＝缺席、平面＝還沒點，DESIGN-next 第三節）。
     畫面先換、背景寫入；寫入失敗就換回來並提示。點過的人不能退回「還沒點」（規則不讓秘書處刪除）。
   - 只有秘書處編輯者以上與總管理員看得到整張卡（個人出缺席資料不公開；規則同樣擋，這裡只管顯示）。
   資料讀寫在 attendance-fs.js（ES module，用到才載入）。畫面插入的文字一律 esc。 */
const AT={key:"",members:undefined,sessions:[],sel:"",recs:{},loading:false,err:"",html:null,busy:false};
const AT_ST=["present","leave","absent"],AT_LB={present:"出席",leave:"請假",absent:"缺席"},AT_CL={present:"on",leave:"lv",absent:"ab"};
const AT_ERR={"permission-denied":"沒有權限，沒有變更",unavailable:"沒有連上網路，沒有變更"};
const atMod=()=>storeModLoad("attendance-fs.js","board-attendance-ready","BoardAttendance");
const atMe=()=>acct.user&&acct.user.uid||"";
const atSee=()=>CFG.meeting&&fsMode()&&!!atMe()&&((typeof acctSuper==="function"&&acctSuper())||fsWriter());
const atRank=r=>/^(會長|部長|處長|秘書長|主任)$/.test(r)?0:/^副/.test(r)?1:/長$/.test(r)?2:3;
const atSess=()=>AT.sessions.find(s=>s.id===AT.sel)||null;
/* 名單排序：部門照看板的部門順序，同部門部長、副部長、其他 */
function atSorted(){
  const order=(window.BOARD_DEPTS||[]).map(d=>d.name),di=n=>{const i=order.indexOf(n);return i<0?99:i};
  return AT.members.filter(m=>m.active).sort((a,b)=>di(a.dept)-di(b.dept)||atRank(a.role)-atRank(b.role)||a.name.localeCompare(b.name,"zh-Hant"));
}
async function atLoad(){
  if(AT.loading)return;AT.loading=true;AT.err="";
  try{
    const B=await atMod();[AT.members,AT.sessions]=await Promise.all([B.members(CFG.firebase),B.sessions(CFG.firebase)]);
    if(!AT.sessions.some(s=>s.id===AT.sel))AT.sel=AT.sessions[0]?AT.sessions[0].id:"";
    AT.recs=AT.sel?await B.records(CFG.firebase,AT.sel):{};
  }catch(e){console.error("點名讀取失敗",e);AT.err=e&&e.code==="permission-denied"?"沒有權限讀取點名資料":"讀取失敗，請稍後再試"}
  AT.loading=false;renderAttendance(true);
}
const atCount=ms=>{const c={present:0,leave:0,absent:0};ms.forEach(m=>{const s=AT.recs[m.id];if(c[s]!==undefined)c[s]++});c.none=ms.length-c.present-c.leave-c.absent;return c};
function atHTML(){
  if(AT.err)return `<p class="sub at-st">${esc(AT.err)}</p>`;
  if(AT.members===undefined)return `<p class="sub at-st">讀取中…</p>`;
  const ms=atSorted();
  if(!ms.length)return `<p class="sub at-st">還沒有名冊。按「匯入名冊」貼上名單，一行一人：部門、職稱、姓名。</p>`;
  const s=atSess(),b=AT.busy?" disabled":"";
  const pick=AT.sessions.length?`<div class="wk-depts at-pick" role="tablist" aria-label="場次">${AT.sessions.map(x=>`<button type="button" role="tab" class="wk-d" data-at="pick" data-id="${esc(x.id)}" aria-selected="${x.id===AT.sel}">${esc(x.title)}<span class="num">${esc(x.date.slice(5).replace("-","/"))}</span></button>`).join("")}</div>`:"";
  if(!s)return pick+`<p class="sub at-st">還沒有點名場次。按「+ 場次」開始第一次點名。</p>`;
  const c=atCount(ms),groups=[];ms.forEach(m=>{const g=groups[groups.length-1];if(g&&g.dept===m.dept)g.ms.push(m);else groups.push({dept:m.dept,ms:[m]})});
  return pick+`<div class="at-sum"><div><b class="num">${c.present}</b><small>出席</small></div><div><b class="num">${c.leave}</b><small>請假</small></div><div><b class="num">${c.absent}</b><small>缺席</small></div><div><b class="num">${c.none}</b><small>還沒點</small></div></div>`
    +groups.map(g=>`<h3 class="at-h">${esc(g.dept||"（沒有部門）")}<span class="num">${g.ms.filter(m=>AT.recs[m.id]==="present").length}/${g.ms.length}</span></h3><div class="at-grid">${g.ms.map(m=>{const st=AT.recs[m.id];
      return `<button type="button" class="at-m${st?" "+AT_CL[st]:""}" data-at="mark" data-id="${esc(m.id)}" aria-label="${esc(m.role)} ${esc(m.name)}：${st?AT_LB[st]:"還沒點"}"><span class="nm">${esc(m.name)}<small>${esc(m.role)}</small></span><i>${st?AT_LB[st]:"還沒點"}</i></button>`}).join("")}</div>`).join("");
}
/* 畫面：沒變就不重畫（render() 很常被呼叫）。登入者或身分變了就重新讀（角色比登入晚到） */
const atKey=()=>`${atMe()}|${atSee()}`;
function renderAttendance(force){
  const p=$("#attPanel");if(!p)return;
  if(!CFG.meeting||!fsMode()||!atMe()){p.hidden=true;return}
  if(AT.key!==atKey()&&!AT.loading){AT.key=atKey();if(atSee()){AT.members=undefined;atLoad()}else{p.hidden=true}return}
  p.hidden=!atSee();if(p.hidden)return;
  const h=atHTML();if(h!==AT.html||force){AT.html=h;$("#attBody").innerHTML=h}
  p.querySelector("[data-at=addsess]").disabled=!AT.members||!AT.members.some(m=>m.active);
  p.querySelector("[data-at=roster]").disabled=!AT.members||!AT.members.length;
  p.querySelector("[data-at=copy]").disabled=!atSess()||!AT.members||!AT.members.some(m=>m.active);
}
/* 匯入名冊：一行一人，部門、職稱、姓名用逗號、Tab 或空白隔開，順序不拘；認得出部門的才收，職稱沒寫當成部員 */
function atParse(txt){
  const dn=(window.BOARD_DEPTS||[]).map(d=>d.name),rows=[];let skip=0;
  txt.split(/\r?\n/).forEach(line=>{
    const ps=line.split(/[,，\t;；、 　]+/).map(x=>x.trim()).filter(Boolean);if(!ps.length)return;
    const di=ps.findIndex(x=>dn.includes(x)||dn.some(d=>d.slice(0,2)===x.slice(0,2)&&/[部處室]$/.test(x)));
    if(di<0||ps.length<2){if(!/部門|單位|姓名/.test(line))skip++;return}
    const dept=dn.find(x=>x===ps[di]||x.slice(0,2)===ps[di].slice(0,2)),rest=ps.filter((_,k)=>k!==di),
      ri=rest.findIndex(x=>/(會長|部長|處長|秘書長|主任|組長|部員|幹部|特助|專員|組員|委員)$/.test(x)),role=ri>=0?rest[ri]:"部員",name=rest.filter((_,k)=>k!==ri)[0];
    if(!name){skip++;return}rows.push({dept,role,name:name.slice(0,30)});
  });
  return {rows,skip};
}
async function atRun(fn,okMsg){
  if(AT.busy)return;AT.busy=true;renderAttendance(true);
  try{await fn();if(okMsg)toast(okMsg)}catch(e){console.error(e);toast(AT_ERR[e&&e.code]||"沒有成功，請稍後再試")}
  AT.busy=false;await atLoad();
}
async function atImport(){
  const v=await ask("匯入名冊",[{name:"txt",type:"textarea",rows:10,ph:"權益部 部長 王小明\n權益部 部員 李小華"}],{wide:true,
    note:"一行一人：部門、職稱、姓名（用空白、逗號或 Tab 隔開）。已經在名冊裡的（同部門同姓名）會略過。名冊只有秘書處與總管理員看得到。",
    validate:o=>atParse(o.txt||"").rows.length?"":"認不出任何一行（要有部門名稱和姓名）"});
  if(!v)return;
  const {rows,skip}=atParse(v.txt),have=new Set(AT.members.map(m=>m.dept+"|"+m.name)),fresh=rows.filter(r=>{const k=r.dept+"|"+r.name;if(have.has(k))return false;have.add(k);return true});
  if(!fresh.length){toast("名單裡的人都已經在名冊裡");return}
  await atRun(async()=>(await atMod()).addMembers(CFG.firebase,fresh),`已加入 ${fresh.length} 人${skip?`，略過 ${skip} 行`:""}`);
}
async function atRoster(){
  const all=[...AT.members].sort((a,b)=>a.dept.localeCompare(b.dept,"zh-Hant")||atRank(a.role)-atRank(b.role)||a.name.localeCompare(b.name,"zh-Hant"));
  const v=await ask("整理名冊",[{name:"on",type:"multi",label:"取消勾選＝停用（不再出現在點名）",options:all.map(m=>[m.id,`${m.dept} ${m.name}`]),value:all.filter(m=>m.active).map(m=>m.id)}],
    {wide:true,note:"停用不會刪除過去的點名紀錄，之後可以再勾回來。"});
  if(!v)return;
  const on=new Set(v.on),ch=all.filter(m=>on.has(m.id)!==m.active).map(m=>({id:m.id,active:on.has(m.id)}));
  if(!ch.length)return;
  await atRun(async()=>(await atMod()).setActive(CFG.firebase,ch),`已更新名冊（停用 ${ch.filter(c=>!c.active).length}、恢復 ${ch.filter(c=>c.active).length}）`);
}
function atText(){
  const s=atSess(),ms=atSorted();if(!s)return "";
  const c=atCount(ms),by=k=>ms.filter(m=>(AT.recs[m.id]||"none")===k).map(m=>`${m.dept}${m.name}`).join("、")||"無";
  return `${s.title}（${s.date.replaceAll("-","/")}）點名\n出席 ${c.present}　請假 ${c.leave}　缺席 ${c.absent}　還沒點 ${c.none}\n請假：${by("leave")}\n缺席：${by("absent")}\n還沒點：${by("none")}`;
}
async function atAddSession(){
  const v=await ask("新增點名場次",[{name:"title",label:"名稱",value:"行政會議"},{name:"date",label:"日期",type:"date",value:today()}],{
    validate:o=>!o.title?"請填名稱":!o.date?"請選日期":o.title.length>30?"名稱最多 30 字":""});
  if(!v)return;
  await atRun(async()=>{const id=await (await atMod()).addSession(CFG.firebase,v.title,v.date);AT.sel=id},"已新增場次");
}
async function atMark(id){
  const s=atSess();if(!s)return;
  const prev=AT.recs[id],next=AT_ST[(AT_ST.indexOf(prev)+1)%3];   /* 沒點過（-1）→ 出席 */
  AT.recs[id]=next;renderAttendance(true);
  try{await (await atMod()).mark(CFG.firebase,s,id,next)}
  catch(e){console.error(e);if(AT.sel===s.id){if(prev)AT.recs[id]=prev;else delete AT.recs[id];renderAttendance(true)}toast(AT_ERR[e&&e.code]||"沒有存到，請稍後再試")}
}
document.addEventListener("click",async ev=>{
  const t=ev.target.closest("#attPanel [data-at]");if(!t||t.disabled)return;
  const k=t.dataset.at;
  if(k==="import")return atImport();
  if(k==="addsess")return atAddSession();
  if(k==="roster")return atRoster();
  if(k==="copy")return navigator.clipboard.writeText(atText()).then(()=>toast("已複製點名結果"),()=>toast("複製失敗"));
  if(k==="mark")return atMark(t.dataset.id);
  if(k==="pick"&&t.dataset.id!==AT.sel){AT.sel=t.dataset.id;AT.recs={};renderAttendance(true);
    try{const id=AT.sel,r=await (await atMod()).records(CFG.firebase,id);if(AT.sel===id){AT.recs=r;renderAttendance(true)}}catch(e){console.error(e);toast("讀取點名結果失敗，請稍後再試")}}
});
