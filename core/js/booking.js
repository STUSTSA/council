/* 核心｜會長預約，會長室端（06，docs/architecture/booking.md；設定檔 follow:true 的會長室看板、firestore 模式）
   「會長室」分頁的一張卡片 #bkPanel：
   - 這張卡是會長室分頁的第一張，所有人都看得到（2026-11-21 使用者找不到入口）：沒登入、還沒啟用、沒有部門角色、沒有開放時段時各寫一行原因，不整張消失。
     首頁下排的「預約會長」鈕（home.js）直接連到這裡（index.html?d=president&tab=ext）。
   - 管理者（calendars/president 的 managers）與總管理員：待審申請（核准／拒絕）、已核准的預約（可退回）、開放時段（新增、刪除）。
   - 還沒啟用（calendars/president 不存在）：總管理員看到「啟用」，按下去建立，管理者名單＝目前會長室的管理員（roles 裡 president 是 admin 的人）。
   - 同學（有部門角色的人，規則 D6）：行事曆已啟用時，這張卡顯示「可預約時段」（開放時段裡還沒被鎖的 30 分鐘格）與「我的預約」（待審、已核准，可取消）；
     按「預約」跳出表單：開始時間、時長（30 分鐘～2 小時）、事由。沒有部門角色的人整張不顯示。管理者與總管理員看管理畫面，不顯示申請區。
   資料讀寫在 booking-fs.js（ES module，用到才載入）；授權由 Security Rules 判斷，這裡只管顯示。畫面插入的文字一律 esc。 */
const BK={key:"",cal:undefined,wins:[],pend:[],appr:[],taken:new Set(),mine:[],busy:false,loading:false,err:"",html:null};
const BK_OWNER="president";
const BK_ERR={taken:"這段時間已經被預約了，請選別的時間",conflict:"這筆剛被別人處理過，已重新整理","permission-denied":"沒有成功（可能沒有權限、待審已滿 3 筆，或這段時間剛被約走）",unavailable:"沒有連上網路，沒有變更",badtime:"時間要對齊整點或半點，而且結束晚於開始"};
const bkMod=()=>storeModLoad("booking-fs.js","board-booking-ready","BoardBooking");
const bkMe=()=>acct.user&&acct.user.uid||"";
const bkSuper=()=>typeof acctSuper==="function"&&acctSuper();
/* 管理者：總管理員，或名單裡的管理者（未啟用時只有總管理員） */
const bkManager=()=>!!BK.cal&&(BK.cal.managers||[]).includes(bkMe());
const bkMgr=()=>bkSuper()||bkManager();
const bkCanReq=()=>!!(acct.roles&&Object.keys(acct.roles.depts||{}).length);   /* 規則 hasDeptRole：有部門角色的人才能申請（D6） */
/* 台灣時間顯示：11/24（二）10:00–11:00 */
const BK_WD="日一二三四五六";
function bkFmt(s,e){const t=new Date(s+8*36e5),u=new Date(e+8*36e5),p=n=>String(n).padStart(2,"0");
  return `${t.getUTCMonth()+1}/${t.getUTCDate()}（${BK_WD[t.getUTCDay()]}）${p(t.getUTCHours())}:${p(t.getUTCMinutes())}–${p(u.getUTCHours())}:${p(u.getUTCMinutes())}`}
const bkName=u=>(acct.names&&acct.names[u])||"同學";

async function bkLoad(){
  if(BK.loading)return;BK.loading=true;BK.err="";
  try{
    const B=await bkMod();BK.cal=await B.calendar(CFG.firebase,BK_OWNER);
    if(BK.cal&&bkMgr()){
      const now=Date.now();
      [BK.wins,BK.pend,BK.appr]=await Promise.all([B.windows(CFG.firebase,BK_OWNER,now),B.bookings(CFG.firebase,BK_OWNER,"pending",0),B.bookings(CFG.firebase,BK_OWNER,"approved",now)]);
    }else if(BK.cal&&bkCanReq()){   /* 同學：開放時段、已被鎖的格、我的申請 */
      const now=Date.now();BK.wins=await B.windows(CFG.firebase,BK_OWNER,now);BK.pend=[];BK.appr=[];
      const last=BK.wins.reduce((m,w)=>Math.max(m,w.end),now);
      [BK.taken,BK.mine]=await Promise.all([B.taken(CFG.firebase,BK_OWNER,Math.floor(now/B.GRID),Math.ceil(last/B.GRID)),B.mine(CFG.firebase,BK_OWNER)]);
      BK.mine=BK.mine.filter(x=>["pending","approved"].includes(x.status)&&x.end>now).reverse();
    }else{BK.wins=[];BK.pend=[];BK.appr=[];BK.mine=[]}
  }catch(e){console.error("會長預約讀取失敗",e);BK.err=e&&e.code==="permission-denied"?"沒有權限讀取預約":"讀取失敗，請稍後再試"}
  BK.loading=false;renderBooking(true);
}
/* 同學看到的：開放時段（每個時段一列，後面是還能預約的格數）＋我的預約 */
const bkFree=w=>{let n=0;for(let i=w.start/1800000;i<w.end/1800000;i++)if(!BK.taken.has(i)&&i*1800000>Date.now())n++;return n};
function bkReqHTML(){
  const b=BK.busy?" disabled":"",ws=BK.wins.filter(w=>w.end>Date.now());
  const mine=BK.mine.map(x=>bkRow(bkFmt(x.start,x.end),`${x.status==="approved"?"已核准":"等會長確認"}：${x.topic}`,`<button type="button" class="icon" data-bk="cancel" data-id="${esc(x.id)}"${b}>取消</button>`)).join("");
  return `<h3 class="bk-h">可預約時段<span class="num">${ws.length}</span></h3>`
    +(ws.length?ws.map(w=>{const f=bkFree(w);return bkRow(bkFmt(w.start,w.end),f?`還有 ${f} 格（每格 30 分鐘）`:"已經約滿",f?`<button type="button" class="primary" data-bk="req" data-id="${esc(w.id)}"${b}>預約</button>`:"")}).join("")
      :`<p class="sub bk-none">目前沒有開放的時段</p>`)
    +`<h3 class="bk-h">我的預約<span class="num">${BK.mine.length}</span></h3>`+(mine||`<p class="sub bk-none">沒有</p>`)
    +`<p class="sub bk-st bk-note">送出後會先佔住時段，等會長確認；一次最多 3 筆待審，每次最長 2 小時。</p>`;
}
const bkRow=(t,sub,btns)=>`<div class="bk-row"><div class="bk-t"><b class="num">${esc(t)}</b>${sub?`<span class="sub">${esc(sub)}</span>`:""}</div><div class="bk-b">${btns}</div></div>`;
function bkHTML(){
  if(BK.err)return `<p class="sub bk-st">${esc(BK.err)}</p>`;
  if(BK.cal===undefined)return `<p class="sub bk-st">讀取中…</p>`;
  if(!BK.cal)return bkSuper()?`<p class="sub bk-st">還沒啟用。啟用後，會長室的管理員（${esc(CFG.dept.adminTitle||"管理員")}）可以開放時段、處理預約。</p><button type="button" class="primary" data-bk="enable"${BK.busy?" disabled":""}>啟用會長預約</button>`
    :`<p class="sub bk-st">會長預約還沒開放。會長室啟用、開出時段後，這裡就能預約。</p>`;
  if(!bkMgr())return bkCanReq()?bkReqHTML():`<p class="sub bk-st">預約只開放給各部門的成員（部長、次長、部員）。請先用 Google 登入並申請加入你的部門，通過後這裡就能預約。</p>`;
  const sec=(h,n,body,empty)=>`<h3 class="bk-h">${h}<span class="num">${n}</span></h3>${n?body:`<p class="sub bk-none">${empty}</p>`}`;
  const b=BK.busy?" disabled":"";
  return sec("待審申請",BK.pend.length,BK.pend.map(x=>bkRow(bkFmt(x.start,x.end),`${bkName(x.requester)}：${x.topic}`,
      `<button type="button" class="icon" data-bk="no" data-id="${esc(x.id)}"${b}>拒絕</button><button type="button" class="primary" data-bk="ok" data-id="${esc(x.id)}"${b}>核准</button>`)).join(""),"沒有待審的申請")
    +sec("已核准的預約",BK.appr.length,BK.appr.map(x=>bkRow(bkFmt(x.start,x.end),`${bkName(x.requester)}：${x.topic}`,
      `<button type="button" class="icon" data-bk="rm" data-id="${esc(x.id)}"${b}>退回</button>`)).join(""),"沒有")
    +sec("開放時段",BK.wins.length,BK.wins.map(x=>bkRow(bkFmt(x.start,x.end),"",`<button type="button" class="icon" data-bk="wdel" data-id="${esc(x.id)}"${b}>刪除</button>`)).join(""),"還沒有開放時段，同學約不到")
    +`<div class="bk-foot"><button type="button" class="icon" data-bk="wadd"${b}>+ 新增開放時段</button></div>`;
}
/* 畫面：沒變就不重畫（render() 很常被呼叫）。登入者或總管理員身分變了就重新讀（角色比登入晚到：總管理員要在角色讀到後才讀得了預約） */
const bkKey=()=>`${bkMe()}|${bkSuper()}|${bkCanReq()}`;
function renderBooking(force){
  const p=$("#bkPanel");if(!p)return;
  if(!CFG.follow||!fsMode()){p.hidden=true;return}
  p.hidden=false;
  const paint=h=>{if(h!==BK.html||force){BK.html=h;$("#bkBody").innerHTML=h}};
  if(!bkMe())return paint(`<p class="sub bk-st">要先登入才能預約。按工具列的設定鈕，用 Google 登入。</p>`);
  if(BK.key!==bkKey()&&!BK.loading){BK.key=bkKey();BK.cal=undefined;bkLoad();return}
  paint(bkHTML());
}
async function bkRun(fn,okMsg){
  if(BK.busy)return;BK.busy=true;renderBooking(true);
  try{await fn();if(okMsg)toast(okMsg)}catch(e){console.error(e);toast(BK_ERR[e&&e.code]||"沒有成功，請稍後再試")}
  BK.busy=false;await bkLoad();
}
async function bkAddWindow(){
  const v=await ask("新增開放時段",[{name:"date",label:"日期",type:"date",value:today()},{name:"st",label:"開始（例 14:00，整點或半點）",value:"14:00"},{name:"et",label:"結束（例 16:00）",value:"16:00"}],{
    note:"同學只能在開放的時段裡預約，一次最長 2 小時。",
    validate:o=>{const a=parseHM(o.st),z=parseHM(o.et);
      if(!o.date||!a||!z)return "日期與時間要填完整（例如 14:00）";
      const s=Date.parse(`${o.date}T${a}:00+08:00`),e=Date.parse(`${o.date}T${z}:00+08:00`);
      if(!(s%1800000===0&&e%1800000===0))return "時間要是整點或半點";
      if(e<=s)return "結束要晚於開始";
      if(s<=Date.now())return "開始時間要在現在之後";
      if(s>Date.now()+60*864e5)return "只能開放 60 天內的時段"}});
  if(!v)return;
  await bkRun(async()=>{const B=await bkMod();await B.addWindow(CFG.firebase,BK_OWNER,Date.parse(`${v.date}T${parseHM(v.st)}:00+08:00`),Date.parse(`${v.date}T${parseHM(v.et)}:00+08:00`))},"已新增開放時段");
}
/* 預約表單：選開始時間（這個時段裡還空著的格）、時長、事由。檢查：連續的格都空著、不超出時段 */
async function bkRequest(id){
  const w=BK.wins.find(x=>x.id===id);if(!w)return;
  const starts=[];for(let i=w.start/1800000;i<w.end/1800000;i++)if(!BK.taken.has(i)&&i*1800000>Date.now())starts.push([String(i),bkFmt(i*1800000,i*1800000+1800000).split("–")[0].replace(/^.*）/,"")]);
  if(!starts.length)return toast("這個時段已經約滿了");
  const v=await ask("預約會長 "+bkFmt(w.start,w.end).replace(/（.）/,"　"),[
    {name:"s",label:"開始時間",type:"select",value:starts[0][0],options:starts},
    {name:"n",label:"時長",type:"select",value:"2",options:[["1","30 分鐘"],["2","1 小時"],["3","1 小時 30 分"],["4","2 小時"]]},
    {name:"topic",label:"事由（必填，會長看得到）",value:""}],{
    note:"送出後會先佔住這段時間，等會長確認。一次最多 3 筆待審。",
    validate:o=>{const s=+o.s,n=+o.n;
      if(!o.topic)return "請寫事由";if([...o.topic].length>40)return "事由最多 40 字";
      if(s+n>w.end/1800000)return "超出這個開放時段，請縮短時長或提早開始";
      for(let i=s;i<s+n;i++)if(BK.taken.has(i))return "這段時間已經被預約了，請選別的時間"}});
  if(!v)return;
  await bkRun(async()=>{const B=await bkMod();await B.request(CFG.firebase,BK_OWNER,w.id,+v.s,+v.n,[...v.topic].slice(0,40).join(""),"")},"已送出，等會長確認");
}
async function bkEnable(){
  await bkRun(async()=>{
    const A=await storeModLoad("fb-account.js","board-account-ready","BoardAccount"),B=await bkMod();
    const rs=await A.rolesList(),mgr=rs.filter(r=>r.depts&&r.depts[BK_OWNER]==="admin").map(r=>r.uid);
    await B.enable(CFG.firebase,BK_OWNER,CFG.dept.name||"會長室",[...mgr,bkMe()]);   /* 啟用的總管理員自己也放進名單，不然啟用後看不到這張卡 */
  },"已啟用會長預約");
}
document.addEventListener("click",async ev=>{
  const t=ev.target.closest("#bkPanel [data-bk]");if(!t||t.disabled)return;
  const k=t.dataset.bk,id=t.dataset.id,B=()=>bkMod();
  if(k==="enable")return bkEnable();
  if(k==="wadd")return bkAddWindow();
  if(k==="req")return bkRequest(id);
  if(k==="cancel"){if(await ask("取消這筆預約？",[],{note:"時段會釋放給別人預約。",danger:"取消預約"})!=="delete")return;
    return bkRun(async()=>(await B()).cancel(CFG.firebase,id),"已取消")}
  if(k==="wdel"){if(await ask("刪除這個開放時段？",[],{danger:"刪除"})!=="delete")return;
    return bkRun(async()=>(await B()).removeWindow(CFG.firebase,id),"已刪除開放時段")}
  if(k==="ok")return bkRun(async()=>(await B()).decide(CFG.firebase,id,"approved"),"已核准");
  if(k==="no"||k==="rm"){if(await ask(k==="no"?"拒絕這筆申請？":"退回這筆已核准的預約？",[],{note:"申請人會看到結果，時段會釋放給別人預約。",danger:k==="no"?"拒絕":"退回"})!=="delete")return;
    return bkRun(async()=>(await B()).decide(CFG.firebase,id,"rejected"),k==="no"?"已拒絕":"已退回")}
});
