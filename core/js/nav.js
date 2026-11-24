/* 核心｜底部工具列、設定頁、拉到底回彈、工具列依背景反轉 */
const IS_IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
/* ---------- 底部工具列（手機）／左側細欄（桌面 900px 以上） ----------
   材質：平面色塊 .glass（util.js 的 glassify；board.css「平面色塊」「底部工具列」段）；選取鏡片是主要動作的實心膠囊（--pri），鏡片底下的圖示用 --pri-ink。
   按鈕機制照 Convx（Kyant backdrop catalog 的 LiquidBottomTabs／DampedDragAnimation／InteractiveHighlight／LiquidButton），手機與桌面同一套，
   差別只在方向（手機水平、桌面直立）：
     - 只有按在鏡片那一格才能拖；拖的時候位置跟著指標（不加彈簧），拖過兩端時整條列跟著偏最多 4px；放開吸到最近的分頁
     - 按下時鏡片放大到 78/56（主軸彈簧 .6／250、側軸 .7／250），移動時依速度沿移動方向拉伸（最多兩成）、垂直方向略縮；
       整條列沿長邊放大 16px、鏡片那一格的內容放大 1.2（--ts，board.css 只套在 .lit 那一格）；
       鏡片位置一圈白光（彈簧 .5／300；2026-11-17 起材質只有平面，白光不畫，--hp 照樣寫但沒有樣式用到）
     - 點分頁＝「按下 → 鏡片移過去（彈簧 1／1000）→ 接近目標或 400ms 後放開」
   設定鍵：按下放大 4px、白光跟著指標、被指標拖著微微偏移與拉伸（tanh 阻尼），放開彈回 */
let setOpen=false;
const TABS=()=>[["live","即時回報","live"],["progress",ISS==="專案"?"專案":"進度","progress"],["done","完成紀錄","done"],["ext",CFG.ext,CFG.extIcon||"flag"]].filter(([k])=>secTab(k));
/* 設定打開時，三個分頁都不亮；點任一個就關掉並回到那一區 */
const tbActive=()=>setOpen?"":curSec;
const RAIL_MQ=matchMedia("(min-width:900px)");
const isRail=()=>RAIL_MQ.matches;
const PRESSED=78/56;
const lens={
  val:spring(0,1,1000),     /* 鏡片位置（第幾個分頁，可以有小數） */
  press:spring(0,1,1000),   /* 按下的程度 0–1：鏡片放大、整列放大、分頁內容放大 */
  sx:spring(1,.6,250),sy:spring(1,.7,250),
  vel:spring(0,.5,300),     /* 速度（每秒幾個分頁 ÷ 分頁間距數），放開時回到 0 */
  off:spring(0,1,300),      /* 整條列跟著拖曳的累積位移（px），顯示時壓成最多 4px */
  hl:spring(0,.5,300),      /* 整條列的白光 */
  drag:null,releaseAt:0,releasing:false,raf:0,last:0,shown:false,
};
const gearSt={p:spring(0,.5,300),ox:spring(0,.5,300),oy:spring(0,.5,300),sx0:0,sy0:0,down:false};
function tabEls(){return [...$("#tabbar").querySelectorAll(".tab")]}
/* 用版面位置（offset）計算，不受全螢幕／縮放動畫影響 */
function tabCenters(){
  /* 相對於 .tb-main（鏡片的定位容器）。分頁有 scale（--ts）時會變成圖示的 offsetParent，所以要看圖示的 offset 是相對誰 */
  const box=$("#tabbar").querySelector(".tb-tabs");
  return tabEls().map(b=>{const ind=b.querySelector(".tab-ind"),inB=ind.offsetParent===b,ix=(inB?b.offsetLeft:0)+ind.offsetLeft,iy=(inB?b.offsetTop:0)+ind.offsetTop;
    return {k:b.dataset.tab,x:box.offsetLeft+ix+ind.offsetWidth/2,y:box.offsetTop+b.offsetTop+b.offsetHeight/2,top:box.offsetTop+iy}});
}
const tabIndex=k=>tabEls().findIndex(b=>b.dataset.tab===k);
function interp(cs,v,key){if(!cs.length)return 0;const i=Math.max(0,Math.min(cs.length-1,Math.floor(v))),j=Math.min(cs.length-1,i+1),f=v-i;return cs[i][key]+(cs[j][key]-cs[i][key])*f}
const clampV=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function tbFrame(){
  const tb=$("#tabbar");if(!tb)return;
  const main=tb.querySelector(".tb-main"),el=tb.querySelector(".tb-lens"),gear=tb.querySelector(".tb-gear");
  const cs=tabCenters();if(!cs.length||!cs[0].x&&!cs[0].y)return;
  /* 手機沿 x、桌面沿 y；其他都一樣 */
  const rail=isRail(),ax=rail?"y":"x",n=cs.length,p=lens.press.x,pos=interp(cs,lens.val.x,ax),len=(rail?main.offsetHeight:main.offsetWidth)||1;
  /* 主軸、側軸的縮放：移動時依速度沿移動方向拉伸（最多兩成，往哪邊移都一樣），垂直方向略縮（DESIGN-next 第五節「彈簧與回彈」） */
  const v=Math.abs(lens.vel.x)/10,ma=lens.sx.x*(1+Math.min(.2,v*.75)),cr=lens.sy.x*(1-Math.min(.2,v*.25));
  if(rail){el.style.top="";el.style.transform=`translate(0,${(pos-el.offsetHeight/2).toFixed(2)}px) scale(${cr.toFixed(4)},${ma.toFixed(4)})`}
  else{el.style.top=cs[0].top+"px";el.style.transform=`translate(${(pos-el.offsetWidth/2).toFixed(2)}px,0) scale(${ma.toFixed(4)},${cr.toFixed(4)})`}
  /* 鏡片底下那一格的圖示反白（跟著鏡片走，不是跟著選取狀態） */
  const lit=el.classList.contains("off")?-1:Math.round(clampV(lens.val.x,0,n-1));
  tabEls().forEach((b,i)=>b.classList.toggle("lit",i===lit));
  /* 整條列：拖過兩端時跟著偏最多 4px（EaseOut；lens.off＝超出兩端的距離），按下時沿長邊放大 16px */
  const fr=clampV(lens.off.x/len,-1,1),ease=1-Math.pow(1-Math.abs(fr),2),po=4*Math.sign(fr)*ease;
  main.style.transform=po?`translate${rail?"Y":"X"}(${po.toFixed(2)}px)`:"";main.style.scale=p>.0005?(1+16/len*p).toFixed(4):"";
  tb.querySelector(".tb-tabs").style.setProperty("--ts",(1+.2*p).toFixed(4));
  main.style.setProperty("--hp",lens.hl.x.toFixed(4));
  main.style.setProperty("--hx",rail?"50%":(pos+po).toFixed(1)+"px");main.style.setProperty("--hy",rail?(pos+po).toFixed(1)+"px":"50%");
  /* 設定鍵（手機、桌面同一套） */
  const g=gearSt,gh=gear.offsetHeight||1,gw=gear.offsetWidth||1,md=Math.min(gw,gh),mx=Math.max(gw,gh),ox=g.ox.x,oy=g.oy.x;
  const gs=1+4/gh*g.p.x,ang=Math.atan2(oy,ox),mds=4/gh;
  const tx=md*Math.tanh(.05*ox/md),ty=md*Math.tanh(.05*oy/md);
  const gsx=gs+mds*Math.abs(Math.cos(ang)*ox/mx)*Math.min(gw/gh,1),gsy=gs+mds*Math.abs(Math.sin(ang)*oy/mx)*Math.min(gh/gw,1);
  gear.style.transform=(tx||ty)?`translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px)`:"";
  gear.style.scale=g.p.x>.0005||tx||ty?`${gsx.toFixed(4)} ${gsy.toFixed(4)}`:"";
  gear.style.setProperty("--hp",g.p.x.toFixed(4));gear.style.setProperty("--hx",(g.sx0+ox).toFixed(1)+"px");gear.style.setProperty("--hy",(g.sy0+oy).toFixed(1)+"px");
}
const TB_SPRINGS=()=>[lens.val,lens.press,lens.sx,lens.sy,lens.vel,lens.off,lens.hl,gearSt.p,gearSt.ox,gearSt.oy];
function tbLoop(now){
  const dt=Math.min(1/30,Math.max(1/240,(now-(lens.last||now))/1000||1/60));lens.last=now;
  if(!lens.drag)TB_SPRINGS().forEach(s=>sprStep(s,dt));
  else{[lens.press,lens.sx,lens.sy,lens.hl,gearSt.p,gearSt.ox,gearSt.oy].forEach(s=>sprStep(s,dt));
    if(now-lens.drag.t>80)sprSnap(lens.vel,0)}   /* 手指停住：速度歸零（Convx 的速度追蹤器也是看最近的移動） */
  /* 放開：等鏡片接近目標（間距的 2.5%）或最多 400ms，才讓按下的形變消失 */
  if(lens.releasing){const n=Math.max(1,tabEls().length-1);if(Math.abs(lens.val.x-lens.val.t)<n*.025||now-lens.releaseAt>400){lens.releasing=false;lens.vel.t=0;lens.press.t=0;lens.sx.t=1;lens.sy.t=1}}
  tbFrame();
  if(lens.drag||lens.releasing||gearSt.down||!TB_SPRINGS().every(s=>sprDone(s,.0008))){lens.raf=requestAnimationFrame(tbLoop);return}
  TB_SPRINGS().forEach(s=>sprSnap(s,s.t));tbFrame();lens.raf=0;lens.last=0;
}
const tbKick=()=>{if(!lens.raf){lens.last=0;lens.raf=requestAnimationFrame(tbLoop)}};
function lensPress(){if(reduceMotion())return;lens.press.t=1;lens.sx.t=PRESSED;lens.sy.t=PRESSED;lens.releasing=false}
function lensRelease(){lens.releasing=true;lens.releaseAt=performance.now()}
/* 移到某個分頁：照 animateToValue（按下 → 移過去 → 放開），手機、桌面一樣 */
function lensTo(k,instant){
  const tb=$("#tabbar");if(!tb)return;const el=tb.querySelector(".tb-lens");
  const i=k?tabIndex(k):-1;el.classList.toggle("off",i<0);
  if(i<0){lens.shown=false;tabEls().forEach(b=>b.classList.remove("lit"));return}
  if(instant||reduceMotion()||!lens.shown){lens.shown=true;sprSnap(lens.val,i);tbFrame();return}
  if(lens.val.t!==i&&!lens.drag){lens.val.t=i;lensPress();lensRelease()}   /* 點分頁：按下 → 移過去 → 放開 */
  tbKick();
}
function renderTabbar(){
  let tb=$("#tabbar");
  if(!tb){
    tb=document.createElement("nav");tb.id="tabbar";tb.className="tabbar";tb.setAttribute("aria-label","主要功能");
    tb.innerHTML=`<div class="tb-main"><span class="tb-lens" aria-hidden="true"></span><div class="tb-tabs" role="tablist"></div></div><button type="button" class="tb-gear" id="setBtn" aria-label="設定" aria-expanded="false">${ico("sliders","solo")}</button>`;weekDotSync();
    document.body.append(tb);setupTabbar(tb);
  }
  const tabs=TABS(),box=tb.querySelector(".tb-tabs"),sig=tabs.map(t=>t[0]).join();
  if(box._sig!==sig){box._sig=sig;box.innerHTML=tabs.map(([k,t,ic])=>`<button type="button" class="tab" role="tab" data-tab="${k}" aria-label="${t}"><span class="tab-ind">${ico(ic,"solo")}</span><span class="tab-l">${t}</span>${k==="done"?'<span class="tb-due" aria-hidden="true"></span>':""}</button>`).join("");lens.shown=false}
  const act=tbActive();
  box.querySelectorAll(".tab").forEach(b=>{const on=b.dataset.tab===act;b.classList.toggle("on",on);b.setAttribute("aria-selected",on)});
  const g=tb.querySelector("#setBtn");g.classList.toggle("on",setOpen);g.setAttribute("aria-expanded",setOpen);
  Anim.toggle(g,!roView,{collapse:true});   /* 唯讀檢視（render.js 的 roView）：設定鍵不出現（DESIGN-next 第十四節）。沒有權限的單位照舊有設定鍵：要用它登入 */
  requestAnimationFrame(()=>lensTo(act));
  fabSync();
}
/* ---------- 新增即時回報的浮動圓鈕（DESIGN-next 第六節「部門內」） ----------
   右下角 60 的圓鈕（主要動作色、加號）；手機在工具列上方。只在即時回報分頁、可以編輯（不是唯讀、不是唯讀檢視）、沒有卡片在編輯或打開、沒有在搜尋時出現。
   id 沿用 #addEvent：點了做原本「+ 新增即時回報」的同一件事（events.js 的主點擊監聽）。設定、通知疊層蓋在它上面（z-index 比疊層低） */
const liveCardOpen=()=>!!lvOpen||!!fvOpen||(CFG.mergeDone&&!!dnOpen);   /* 即時回報的卡片打開（live.js）；會長室、秘書處併進來的完成紀錄、會長收藏的卡片打開也算 */
function fabSync(){
  let fb=$("#addEvent");
  if(!fb){document.body.insertAdjacentHTML("beforeend",`<button type="button" class="fab" id="addEvent" aria-label="新增即時回報" aria-haspopup="menu" aria-expanded="false" hidden>${ico("plus","solo")}</button>`);fb=$("#addEvent")}
  const on=secTab("live")&&curSec==="live"&&!notiOpen&&canEdit()&&!editing&&!HS.mode&&!liveCardOpen();
  if(!on&&fabOn)fabClose(true);
  Anim.toggle(fb,on);
  tourSync(on);   /* 新手引導（tour.js）：圓鈕能出現＝可以引導 */
  /* 內容底部的留白看「圓鈕可能出現」（可編輯的單位、即時回報分頁），不看這一刻有沒有出現：打開卡片、搜尋、唯讀檢視時不跳動（board.css 基礎段的 --fab-in） */
  document.body.classList.toggle("fab-room",secTab("live")&&curSec==="live"&&deptCan());
}
/* ---------- 圓鈕展開的三個選項（文字、清單、時間；Google Keep 的做法） ----------
   按圓鈕＝背景淡暗、三顆膠囊從圓鈕往上依序浮出（離圓鈕最近的先出）、加號轉成 ×；點背景、×、Esc、系統返回都收起。
   選一個＝新增一張空白即時回報，並先放好那一種的第一行（events.js 的 #addEvent／[data-fabadd]，live.js 的 kpSeed）。沒有新資料欄位 */
const FAB_OPTS=[["time","clock","時間"],["check","box","清單"],["text","text","文字"]];   /* 由上到下 */
let fabOn=false;
function fabMenuEl(){
  let m=$("#fabMenu");
  if(!m){document.body.insertAdjacentHTML("beforeend",`<div class="fab-menu" id="fabMenu" hidden><div class="fab-scrim" data-fabx></div><div class="fab-opts" role="menu" aria-label="新增內容類型">${FAB_OPTS.map(([k,ic,t])=>`<button type="button" class="fab-opt" role="menuitem" data-fabadd="${k}">${ico(ic,"solo")}<span>${t}</span></button>`).join("")}</div></div>`);m=$("#fabMenu")}
  return m;
}
function fabOpen(){
  if(fabOn)return;fabOn=true;
  const m=fabMenuEl(),fb=$("#addEvent"),sc=m.querySelector(".fab-scrim"),os=[...m.querySelectorAll(".fab-opt")].reverse();   /* 反過來：離圓鈕最近的在前 */
  m.getAnimations({subtree:true}).forEach(a=>a.cancel());m.hidden=false;fb.classList.add("open");fb.setAttribute("aria-expanded","true");fb.setAttribute("aria-label","收起新增選項");
  Back.opened("fab",()=>fabClose(false,true));
  if(reduceMotion())return;
  sc.animate([{opacity:0},{opacity:1}],{duration:MO.base,easing:MO.out});
  os.forEach((o,i)=>o.animate([{opacity:0,transform:"translateY(24px)"},{opacity:1,transform:"translateY(0)"}],{duration:MO.base+60,delay:i*45,easing:MO.out,fill:"backwards"}));
}
/* 收起：now＝馬上藏（換頁、卡片打開時）；fromBack＝系統返回已經退了瀏覽紀錄 */
function fabClose(now,fromBack){
  if(!fabOn)return;fabOn=false;
  const m=$("#fabMenu"),fb=$("#addEvent");if(!fromBack)Back.closed("fab");
  if(fb){fb.classList.remove("open");fb.setAttribute("aria-expanded","false");fb.setAttribute("aria-label","新增即時回報")}
  if(!m)return;
  const done=()=>{if(!fabOn){m.hidden=true;m.getAnimations({subtree:true}).forEach(a=>a.cancel())}};
  if(now||reduceMotion()){done();return}
  m.querySelector(".fab-scrim").animate([{opacity:1},{opacity:0}],{duration:MO.fast,easing:MO.in,fill:"forwards"});
  const os=[...m.querySelectorAll(".fab-opt")];
  Promise.all(os.map((o,i)=>o.animate([{opacity:1,transform:"translateY(0)"},{opacity:0,transform:"translateY(16px)"}],{duration:MO.fast,delay:i*20,easing:MO.in,fill:"forwards"}).finished.catch(()=>{}))).then(done);
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&fabOn){e.preventDefault();e.stopPropagation();fabClose()}},true);
function tabGo(k){Sfx.play("tab");if(setOpen)closeSettings();if(notiOpen){closeNoti(false,k);return}setSection(k)}   /* 通知與行事曆那一頁：按任一分頁＝離開這一頁、到那個分頁（notify.js） */
function setupTabbar(tb){
  const main=tb.querySelector(".tb-main"),gear=tb.querySelector(".tb-gear"),lensEl=tb.querySelector(".tb-lens");
  /* 毛玻璃：分頁列、設定鍵各一塊（桌面也一樣，分頁列直立） */
  glassify(main);glassify(gear);
  let suppress=false,lastX=0,lastT=0,lastV=0;
  const at=e=>isRail()?e.clientY:e.clientX;   /* 指標在主軸上的位置 */
  tb.addEventListener("click",e=>{if(suppress&&e.isTrusted){e.stopPropagation();e.preventDefault()}},true);
  /* 只有按在鏡片那一格才拖；按下立刻放大（手機、桌面一樣） */
  main.addEventListener("pointerdown",e=>{
    if(e.button>0||lens.drag||!e.target.closest(".tab"))return;
    const cs=tabCenters();if(!cs.length||lens.press.t===0&&$("#tabbar .tb-lens").classList.contains("off"))return;
    const rail=isRail(),ax=rail?"y":"x",r=main.getBoundingClientRect();
    const slot=cs.length>1?Math.abs(cs[1][ax]-cs[0][ax]):(rail?main.offsetHeight:main.offsetWidth);
    const lp=interp(cs,lens.val.x,ax);if(Math.abs(at(e)-(rail?r.top:r.left)-lp)>slot/2)return;
    lens.drag={id:e.pointerId,x:at(e),moved:false,slot,n:cs.length,t:performance.now(),raw:lens.val.x};lastX=at(e);lastT=performance.now();lastV=lens.val.x;
    try{main.setPointerCapture(e.pointerId)}catch(_){}
    tb.classList.add("dragging");lensPress();lens.hl.t=reduceMotion()?0:1;tbKick();
  });
  main.addEventListener("pointermove",e=>{
    const d=lens.drag;if(!d||e.pointerId!==d.id)return;
    if(e.pointerType==="mouse"&&e.buttons===0){dragEnd();return}
    const c=at(e),dx=c-d.x;d.x=c;if(!dx)return;if(Math.abs(c-lastX)>2||d.moved)d.moved=true;
    d.raw+=dx/d.slot;sprSnap(lens.val,clampV(d.raw,0,d.n-1));sprSnap(lens.off,(d.raw-lens.val.x)*d.slot);   /* 拖過兩端：鏡片停在端點，超出的部分讓整條列跟著偏 */
    const now=performance.now(),dt=Math.max(8,now-lastT)/1000;sprSnap(lens.vel,(lens.val.x-lastV)/dt/Math.max(1,d.n-1));lastV=lens.val.x;lastT=now;d.t=now;lastX=c;
    const near=Math.round(lens.val.x);tabEls().forEach((b,i)=>b.classList.toggle("hov",i===near));
    if(near!==d.near){if(d.near!==undefined)Sfx.play("move");d.near=near}   /* 鏡片拖過一格＝移動焦點 */
    tbKick();
  });
  function dragEnd(){
    const d=lens.drag;if(!d)return;lens.drag=null;tb.classList.remove("dragging");tabEls().forEach(b=>b.classList.remove("hov"));
    if(d.moved){suppress=true;setTimeout(()=>suppress=false,80)}
    const i=Math.round(clampV(lens.val.x,0,d.n-1)),k=tabEls()[i]&&tabEls()[i].dataset.tab;
    lens.vel.t=lens.vel.x;lens.off.t=0;lens.hl.t=0;lens.val.t=i;lensRelease();tbKick();
    if(d.moved&&k&&k!==tbActive())setTimeout(()=>tabGo(k),60);
    else if(!d.moved&&k&&notiOpen)setTimeout(()=>tabGo(k),60);   /* 通知與行事曆那一頁：按鏡片那一格（指標被整列接走，click 不會落在分頁上）＝回到原分頁 */
  }
  main.addEventListener("pointerup",dragEnd);main.addEventListener("pointercancel",dragEnd);
  /* 觸控時瀏覽器會先把指標鎖在按下的那顆按鈕；改鎖到整列時，那顆按鈕送出的 lostpointercapture 會冒泡上來，不能當成放開 */
  main.addEventListener("lostpointercapture",e=>{if(e.target===main)dragEnd()});
  addEventListener("pointerup",dragEnd);addEventListener("pointercancel",dragEnd);addEventListener("blur",dragEnd);
  /* 設定鍵：LiquidButton */
  gear.addEventListener("pointerdown",e=>{
    if(e.button>0||reduceMotion())return;const r=gear.getBoundingClientRect(),g=gearSt;
    g.down=e.pointerId;g.sx0=e.clientX-r.left;g.sy0=e.clientY-r.top;g.x0=e.clientX;g.y0=e.clientY;sprSnap(g.ox,0);sprSnap(g.oy,0);g.p.t=1;
    try{gear.setPointerCapture(e.pointerId)}catch(_){}tbKick();
  });
  gear.addEventListener("pointermove",e=>{const g=gearSt;if(g.down!==e.pointerId)return;sprSnap(g.ox,e.clientX-g.x0);sprSnap(g.oy,e.clientY-g.y0);tbKick()});
  const gearUp=e=>{const g=gearSt;if(g.down===false||e&&e.pointerId!==undefined&&e.pointerId!==g.down)return;g.down=false;g.p.t=0;g.ox.t=0;g.oy.t=0;tbKick()};
  gear.addEventListener("pointerup",gearUp);gear.addEventListener("pointercancel",gearUp);addEventListener("pointerup",gearUp);addEventListener("blur",()=>gearUp());
  if(window.ResizeObserver)new ResizeObserver(()=>tbFrame()).observe(main);   /* 列的寬度變了（設定鍵出現／消失、字型載入）：鏡片照新的位置重畫 */
  const relayout=()=>lensTo(tbActive(),true);
  RAIL_MQ.addEventListener("change",()=>{TB_SPRINGS().forEach(s=>sprSnap(s,s===lens.val?s.x:(s===lens.sx||s===lens.sy?1:0)));lens.drag=null;lens.releasing=false;requestAnimationFrame(relayout)});
  addEventListener("resize",()=>lensTo(tbActive(),true));
  document.fonts?.ready.then(()=>lensTo(tbActive(),true));
}
document.addEventListener("click",e=>{
  const t=e.target;if(!t.closest)return;
  /* 用滑鼠／手指點的：先放掉焦點，關掉對話框後才不會在按鈕上留下焦點框 */
  const tbBtn=t.closest("#tabbar button");if(tbBtn&&e.detail>0)tbBtn.blur();
  const tab=t.closest("#tabbar .tab");if(tab){tabGo(tab.dataset.tab);return}
  if(t.closest("#setBtn")){
    /* 通知頁開著：把它那一筆瀏覽紀錄直接換成設定（Back.replace），不先 history.back() 再推一筆——非同步的退一筆會跟設定推的那筆打架，紀錄變 null、系統返回直接離站（ui-06 審查 P2-7） */
    if(notiOpen&&!setOpen){Back.replace("noti","settings",i=>closeSettings(i));closeNoti(true)}
    setOpen?closeSettings():openSettings();return}
},true);

/* ---------- 設定頁 ---------- */
/* 登入前整頁只顯示鎖頭；桌面（900px 以上）點了有下一層的項目，清單往左滑、右側面板顯示內容；手機照舊跳出對話框 */
const SR_CHEV='<span class="sr-chev" aria-hidden="true"><svg viewBox="0 0 8 14" width="7" height="12"><path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
/* 一列：k＝項目代號；attr＝"set"（設定清單）或 "hub"（合併頁裡的一列） */
/* 設定列：只有圖示、名稱、右側箭頭（DESIGN-next 第十二節：列下面不放小字，目前的值也不放）。k、標題 t 一律在這裡跳脫（03 審查 P2-3），呼叫端傳純文字、不傳 HTML */
const setRow=(k,ic,t,off,attr="set",tag="")=>`<button type="button" class="set-row" data-${attr}="${esc(k)}"${off?' aria-disabled="true"':""}${attr==="set"&&k===paneKey?' aria-current="true"':""}><span class="sr-ico">${ico(ic,"solo")}</span><b class="sr-t">${esc(t)}</b>${tag?`<span class="sr-tag">${esc(tag)}</span>`:""}${off?"":SR_CHEV}</button>`;
const setSec=rows=>`<section class="set-sec"><div class="set-list">${rows}</div></section>`;
const GATE_LOCK='<svg viewBox="0 0 64 64" width="104" height="104" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="gate-shackle" d="M22 29v-8a10 10 0 0 1 20 0v8"/><g class="gate-body"><rect x="14" y="29" width="36" height="26" rx="7"/><circle cx="32" cy="39.5" r="2.6"/><path d="M32 42v5"/></g></svg>';
/* 「這台裝置」：沒登入、唯讀時只在有東西可做（安裝、加入主畫面）時出現（03 F4、審查 P1-2：Chrome 自己的安裝提示被 pwa.js 收起來，要給一個入口） */
/* 列名：Firestore 模式裡面只有安裝（含 iPhone 加入主畫面的步驟），直接叫「安裝」（下載圖示）；GitHub 模式還有「忘記這台裝置」，仍叫「這台裝置」 */
const devRow=()=>devForget()?setRow("device","device","這台裝置"):setRow("device","download","安裝");
const devSec=()=>devShow()?setSec(devRow()):"";
/* 「外觀」：所有情況都是設定清單最後一列，點進去是合併頁（SET_HUBS.look；主題、深淺色、音效） */
/* 使用說明（guide.js）：示範動畫＋假資料練習，不用登入；跟「外觀」同一塊，放在它上面 */
const lookSec=()=>setSec(setRow("guide","help","使用說明")+setRow("look","theme","外觀"));
/* 「重看新手引導」：只給能編輯的人（引導教的是完成、刪除、編輯卡片）；按了關掉設定、回即時回報從頭再看一次（tour.js 的 tourReplay）。沒有下一層，所以沒有箭頭 */
const tourSec=()=>setSec(`<button type="button" class="set-row" data-tour-replay><span class="sr-ico">${ico("eye","solo")}</span><b class="sr-t">重看新手引導</b></button>`);
/* 設定清單（2026-11-06 整理）：不寫小標題，用間距分成幾塊；同類的功能合成一列（點了進合併頁，見下面 SET_HUBS），部長用不到的不列。
   登入前只有鎖頭（每週報告在完成紀錄的週頁裡，本來就公開看） */
function settingsInner(){
  if(storeSource()==="firestore"||(storeSource()==="frozen"&&FB_ON))return acctSettingsInner();   /* 02B：新資料庫的部門用 Google 登入（account.js）；02D D-a：凍結中的部門也是（總管理員從這裡匯入） */
  /* 登入前：只有標題與按鈕，標題下不放說明句（ui-08） */
  if(!loggedIn())return (boardLocked()
    ?`<div class="set-gate"><b>${storeLocked()?"暫停編輯":"這是唯讀版"}</b></div>`
    :`<div class="set-gate"><button type="button" class="set-gate-ico" data-set-login aria-label="登入">${GATE_LOCK}</button><b>登入後才能使用設定</b><button type="button" class="primary" data-set-login>登入</button></div>`)+devSec()+lookSec();
  if(readOnly())return setSec(setRow("log","history","編輯紀錄"))+devSec()+lookSec();
  return setSec(setRow("report","doc","工作報告")+setRow("log","history","編輯紀錄"))+
    setSec(setRow("team","people","人員")+
      setRow("labels","tag","標籤")+
      (termOwn()?setRow("term","calendar","學年與開學日"):""))+
    setSec(setRow("backup","download","備份")+
      devRow())+
    (siteAdmin()?setSec(setRow("site","cloud","網站管理")):"")+tourSec()+lookSec();
}
/* 設定是部門內的一頁（DESIGN-next 第六節「部門內」、第十二節；ui-09）：部門標題列（同一個節點，data-fx-keep）留在畫面上，設定清單、桌面右側面板、手機子頁都從標題列下緣開始蓋。
   打開時頁面捲回頂端（跟換分頁一樣，render.js 的 secSwap），底下的頁面鎖住不捲（board.css body.set-open）；--set-top＝標題列下緣，視窗大小變了重量 */
function setTopSync(){const h=$(".dhead"),b=h&&!h.hidden?Math.max(0,Math.round(h.getBoundingClientRect().bottom)):0;document.documentElement.style.setProperty("--set-top",b+"px")}
addEventListener("resize",()=>{if(setOpen)setTopSync()});
/* 設定頁沒有自己的標題列（DESIGN-next 第十二節）：沒有 logo 與「關閉」，進出都用工具列的設定鍵（再按＝關閉；系統返回、Esc 關最上層）。
   所以 #setOv 不設 aria-modal：設成強制回應的話，報讀器會把外面的工具列（唯一的關閉控制）當成不可用（ui-08 審查） */
function settingsHTML(){
  return `<div class="set-body"><div class="set-scroll"><div class="set-inner"></div></div><div class="set-pane" hidden></div></div>`;
}
/* 鎖頭：鎖扣反覆打開、落下，落下時鎖身輕輕一震 */
function gateAnim(){
  const sh=$("#setOv .gate-shackle"),bd=$("#setOv .gate-body");if(!sh||reduceMotion()||sh.getAnimations().length)return;   /* 原位更新後還是同一個鎖頭：正在播就不再疊一份 */
  const o={duration:2600,iterations:Infinity};
  sh.animate([{transform:"none",offset:0,easing:"cubic-bezier(.3,0,.2,1)"},{transform:"translateY(-8px)",offset:.24},{transform:"translateY(-8px)",offset:.56,easing:"cubic-bezier(.5,0,.8,.4)"},{transform:"translateY(1px)",offset:.68},{transform:"none",offset:.76},{transform:"none",offset:1}],o);
  bd.animate([{transform:"none",offset:0},{transform:"none",offset:.67},{transform:"translateY(1.5px)",offset:.71},{transform:"none",offset:.8},{transform:"none",offset:1}],o);
}
function renderSettings(){const el=$("#setOv .set-inner");if(el&&setOpen){const flip=Anim.capture();morphTo(el,settingsInner());weekDotSync();gateAnim();flowWatch();Anim.play(flip)}}   /* 列有增減（登入前後、標籤數）時照動畫規則 2 滑動／淡入 */
async function openSettings(){
  let ov=$("#setOv");
  if(!ov){document.body.insertAdjacentHTML("beforeend",`<div class="set-ov" id="setOv" role="dialog" aria-label="設定" hidden>${settingsHTML().replace('<div class="set-inner">','<div class="set-inner" data-flip="set">')}</div>`);ov=$("#setOv");
    elastic(ov.querySelector(".set-scroll"),ov.querySelector(".set-inner"))}
  if(setOpen)return;
  if(!loggedIn()&&remRead())await remLogin();   /* 這台裝置記住了身分：直接進去，不顯示鎖頭 */
  const from=pageUnder(ov);PageFx.settle(ov);
  const pm=$("#pageMain"),ws=$("#wrapSc");if(pm)pm.scrollTop=0;if(ws)ws.scrollTop=0;setTopSync();   /* 設定是部門內的一頁：標題列留在畫面上（捲回頂端），設定從標題列下緣開始蓋 */
  setOpen=true;ov.getAnimations().forEach(a=>a.cancel());ov.hidden=false;Back.layers.settings();   /* 關閉動畫還沒播完又打開：先停掉 */document.body.classList.add("set-open");renderSettings();renderTabbar();
  PageFx.swap(from,ov);   /* 換頁動畫：底下那頁往後退、設定從後面浮上來 */
}
function closeSettings(instant){
  const ov=$("#setOv");if(!ov||!setOpen)return;if(!instant)Sfx.play("back");
  if(paneKey){paneSeq++;paneDismiss(true);paneReset()}
  const sub=subOpen&&!instant?$("#setSub"):null,under=pageUnder(ov);
  subCloseNow(!!sub);
  setOpen=false;renderTabbar();Back.closed("settings");
  const done=()=>{if(!setOpen){ov.hidden=true;document.body.classList.remove("set-open")}};
  if(instant){PageFx.settle(ov);return done()}
  if(sub){PageFx.settle(ov);ov.hidden=true;PageFx.swap(sub,under,{done:()=>{if(!subOpen)sub.hidden=true;done()}});return}   /* 從子頁直接關：子頁往後退，設定清單在它底下先藏起來（不閃出來） */
  PageFx.swap(ov,under,{done});   /* 換頁動畫：設定往後退、底下那頁從後面浮上來 */
}

/* ---------- 設定頁：桌面版右側面板 ----------
   paneKey＝目前選到的項目；paneJob＝正在右側進行的流程（對話框或編輯紀錄），流程結束就收起面板。
   換選另一項時先把目前的流程當成「取消」結束，再開新的。 */
let paneKey="",paneSeq=0,paneJob=null;
const PANE_MQ=matchMedia("(min-width:900px)");
const setEls=()=>{const b=$("#setOv .set-body");return b&&{body:b,sc:b.querySelector(".set-scroll"),pane:b.querySelector(".set-pane")}};
function setPaneHost(){
  if(subOpen)return $("#setSub .set-sub-body");const e=setEls();return setOpen&&paneKey&&e&&!e.pane.hidden?e.pane:null}
/* ---------- 設定頁：手機版的下一層（全畫面子頁 #setSub） ----------
   手機（900px 以下）點了有下一層的項目：用換頁動畫進到子頁，表單畫在裡面（dlgOpen 經 setPaneHost 找到它，跟桌面右側面板同一套）；
   左上「返回」、系統返回鍵＝把這個流程當成取消（paneDismiss），流程一結束（完成、取消）就用換頁動畫回到設定清單。 */
let subOpen=false;
function subEl(){
  let s=$("#setSub");if(s)return s;
  document.body.insertAdjacentHTML("beforeend",`<div class="set-ov set-sub" id="setSub" role="dialog" aria-modal="true" aria-label="設定" hidden><div class="set-sub-body"></div></div>`);
  return $("#setSub");
}
async function subRun(fn){
  const s=subEl(),ov=$("#setOv");if(subOpen)return;
  subOpen=true;PageFx.settle(s);s.hidden=false;Back.opened("sub",()=>paneDismiss());
  PageFx.swap(ov,s);
  const job=paneJob=Promise.resolve().then(fn).catch(err=>console.error(err));await job;if(paneJob===job)paneJob=null;
  if(!subOpen)return;   /* 已經被 closeSettings 直接收掉 */
  subOpen=false;Back.closed("sub");renderSettings();
  PageFx.swap(s,ov,{done:()=>{if(!subOpen)s.hidden=true}});
}
/* 關掉整個設定時，子頁一起收掉；keep＝子頁先留著（closeSettings 要拿它播往後退的動畫） */
function subCloseNow(keep){const s=$("#setSub");if(!subOpen||!s)return;subOpen=false;Back.closed("sub");paneDismiss(true);if(keep)return;PageFx.settle(s);s.hidden=true}
function paneMark(){document.querySelectorAll("#setOv .set-row").forEach(r=>r.dataset.set===paneKey?r.setAttribute("aria-current","true"):r.removeAttribute("aria-current"))}
function paneShow(k){
  const e=setEls();paneKey=k;paneMark();if(e.body.classList.contains("split"))return;
  const w0=e.sc.getBoundingClientRect().width;e.body.classList.add("split");e.pane.hidden=false;const w1=e.sc.getBoundingClientRect().width;
  if(reduceMotion())return;
  e.sc.animate([{flexBasis:w0+"px"},{flexBasis:w1+"px"}],{duration:480,easing:"cubic-bezier(.2,.9,.25,1)"});
  e.pane.animate([{opacity:0,transform:"translateX(40px)"},{opacity:1,transform:"none"}],{duration:420,delay:120,easing:"cubic-bezier(.2,.9,.25,1)",fill:"backwards"});
}
function paneHide(){
  const e=setEls();paneKey="";paneMark();if(!e||!e.body.classList.contains("split"))return;
  const back=()=>{if(paneKey)return;const w0=e.sc.getBoundingClientRect().width;paneReset();const w1=e.sc.getBoundingClientRect().width;
    /* 收回後的清單是 flex-grow:1（撐滿），只動 flex-basis 會一下子就撐滿、看不到動畫；動畫期間把 grow 壓成 0 */
    if(!reduceMotion())e.sc.animate([{flexBasis:w0+"px",flexGrow:0},{flexBasis:w1+"px",flexGrow:0}],{duration:MO.slow+20,easing:MO.out})};
  if(reduceMotion())return back();
  e.pane.animate([{opacity:1},{opacity:0,transform:"translateX(24px)"}],{duration:180,easing:"ease-in"}).onfinish=back;
}
function paneReset(){const e=setEls();paneKey="";if(!e)return;e.body.classList.remove("split");e.pane.hidden=true;paneMark()}
/* 把右側正在進行的流程當成取消：編輯紀錄就關掉，對話框就送出 cancel（身分與專員會照「完成」處理）。
   合併頁（hubRun）：all＝整個收掉（換項目、關設定）；否則一次退一層（合併頁裡開著的功能先取消、回到合併頁，再退才離開） */
function paneDismiss(all){
  const lg=$("#logOv"),hubOn=hubNow&&!hubNow.inFlow;
  if(hubNow&&(all||hubOn))hubNow.end();
  if(hubOn)return paneJob||Promise.resolve();
  if(acctPanelEnd){acctPanelEnd(all);return paneJob||Promise.resolve()}   /* 帳號、系統管理的面板（account.js）：一次收一層，all＝全部；面板裡開著的表單由 acctPanel 收掉時一起取消 */
  if(lg&&!lg.hidden&&lg.classList.contains("in-pane"))closeLog();
  else dlgPaneCancel();   /* 面板就是表單（名稱、看板名稱、身分與專員、標籤…）：當成取消（dialog.js） */
  return paneJob||Promise.resolve();
}
async function paneRun(k,fn){
  const my=++paneSeq;
  if(paneJob)await paneDismiss(true);
  if(my!==paneSeq)return;
  paneShow(k);
  const job=paneJob=Promise.resolve().then(fn).catch(err=>console.error(err));
  await job;
  if(paneJob===job)paneJob=null;
  renderSettings();
  if(my===paneSeq)paneHide();
}
async function paneClose(){paneSeq++;await paneDismiss(true);paneHide()}
PANE_MQ.addEventListener("change",()=>{if(!PANE_MQ.matches&&paneKey){paneSeq++;paneDismiss(true);paneReset()}});

/* 學年與開學日（2026-11-06 起只有秘書處能改，全會共用，見 state.js 的 termCfg）：學年、甘特圖預設學期、開學日各自修改 */
const BOARD_INFO={
  /* 學年：用上下按鈕改數字（不用打字）；存成「115學年」。原本的文字裡沒有數字就從今天推算（8 月起算新學年） */
  year:["學年",()=>{const m=String(state.yearLabel||"").match(/\d+/),d=new Date(),roc=d.getFullYear()-1911-(d.getMonth()<7?1:0);
    return [{name:"v",label:"學年",type:"stepper",value:m?+m[0]:roc,min:100,max:200,suffix:"學年"},
      {name:"sem",label:"學期（各部門的甘特圖打開時預設看這個學期）",type:"select",value:state.semester||"",options:[["","不指定（看全部）"],["up","上學期（8 月～隔年 1 月）"],["down","下學期（2 月～7 月）"]]}]},v=>{state.yearLabel=v.v?`${v.v}學年`:"";state.semester=v.sem||""}],
  term:["開學日",()=>[{name:"v",label:"開學日（各部門用來算開學第幾週）",type:"date",value:state.termStart||""}],v=>{state.termStart=v||""}],
};
async function editBoardInfo(k){
  const [t,fields,apply]=BOARD_INFO[k];
  const v=await ask(t,fields());if(!v)return;
  const key={year:"yearLabel",term:"termStart"}[k];
  if(k==="year"){if(`${v.v}學年`===(state.yearLabel||"")&&(v.sem||"")===(state.semester||""))return;await settingSave(()=>apply(v),`已更新${t}`);return}
  if((v.v||"")===(state[key]||""))return;
  await settingSave(()=>apply(v.v),`已更新${t}`);
}
function forgetDevice(){remClear();if(!editing){meId="";sessionPw="";sharedPwSession=""}renderSettings();render();toast("已忘記這台裝置，下次要重新輸入密碼")}

/* ---------- 設定頁：合併頁（2026-11-06 使用者：同類的功能合成一頁，但功能彼此分開、不互相干涉） ----------
   畫在右側面板（桌面）或子頁（手機）裡，一列一個功能：
   - flow（有自己表單的，例如雲端同步）：合併頁先藏起來，表單畫在同一個位置；做完或取消就回到合併頁。
   - act（直接執行的，例如匯出備份、忘記這台裝置）：合併頁留著，執行完更新文字。
   返回（子頁的「返回」、系統返回、Esc）一次退一層：先退出功能回到合併頁，再退才離開（paneDismiss）。 */
let hubNow=null;
function hubRun(title,rows,{head=()=>"",foot=()=>"",mount}={}){   /* head：標題下、清單上面的內容（帳號的名稱、信箱、角色）；foot：清單下面的內容（「這台裝置」的加入主畫面步驟、外觀）；mount(box)：每次畫完之後（外觀的分段切換） */
  return new Promise(res=>{
    const host=setPaneHost();if(!host)return res();
    const box=document.createElement("div");box.className="set-hub";host.prepend(box);
    let list=[];
    const draw=()=>{list=rows();morphTo(box,`${panelHead(title)}${head()}${list.length?`<div class="set-list">${list.map(r=>setRow(r.k,r.ic,r.t,r.off,"hub",r.tag)).join("")}</div>`:""}${foot()}`);weekDotSync();if(mount)mount(box)};   /* 原位更新：外觀的分段切換、沒變的列留著 */
    const me=hubNow={inFlow:false,draw,end(){if(hubNow===me)hubNow=null;box.remove();res()}};   /* draw：資料變了（帳號、角色，account.js 的 acctChanged）時原位重畫 */
    draw();
    box.addEventListener("click",async e=>{
      const b=e.target.closest("[data-hub]");if(!b||me.inFlow||hubNow!==me||b.getAttribute("aria-disabled")==="true")return;
      const r=list.find(x=>x.k===b.dataset.hub);if(!r)return;
      if(r.act){await r.act();if(hubNow===me)draw();return}
      me.inFlow=true;box.hidden=true;Back.opened("hubflow",()=>paneDismiss());
      try{await r.flow()}catch(err){console.error(err)}
      Back.closed("hubflow");me.inFlow=false;
      if(hubNow!==me)return;   /* 等的時候整個合併頁已經被收掉（換項目、關設定） */
      draw();box.hidden=false;renderSettings();
    });
  });
}
/* 合併頁最上面的狀態塊（ui-09）：設定列上不放目前的值（DievE 11/16 定），進到合併頁時最上面一塊寫目前的狀態（「標題＋值」，跟帳號頁的名稱塊同一種樣式 .acct-me）。
   rows＝[[標題, 值], …]，一律跳脫 */
const hubSt=rows=>rows.length?`<div class="acct-me">${rows.map(([k,v])=>`<div class="acct-person"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>`:"";
const remName=()=>{const rem=remRead();return rem&&(state.members.find(m=>m.id===rem.id)||{}).name||""};
const SET_HUBS={
  backup:()=>hubRun("備份",()=>[
    {k:"export",ic:"download",t:"匯出備份",act:()=>exportBackup()},
    ...(fsMode()?[]:[{k:"import",ic:"upload",t:"匯入備份",act:()=>$("#importFile").click()}])]),   /* firestore 模式只能匯出（匯入會整份取代；回復路徑＝匯出 → 改回 github → 在 github 模式匯入，docs/遷移步驟.md 第 4 節）。events.js 的 #importFile 也擋下 */
  /* 這台裝置：安裝（瀏覽器支援時）；iPhone／iPad Safari 的加入主畫面步驟（03 F4）；忘記記住的身分（只有 GitHub 模式） */
  device:()=>hubRun(devForget()?"這台裝置":"安裝",()=>{const n=remName();
    return [...pwaOptions().map(o=>({...o,act:async()=>{await o.act();if(!devForget()&&!devShow())paneDismiss()}})),   /* 安裝完沒有別的可做：收掉這一頁 */
      ...(!devForget()?[]:[{k:"forget",ic:"device",t:"忘記這台裝置",off:!n,act:()=>forgetDevice()}])]},
    {head:()=>devForget()?hubSt([["記住的身分",remName()||"沒有記住身分"]]):"",   /* GitHub 模式：這台裝置記住了誰（忘記之後即時改） */
     foot:()=>pwaIosSteps()?`<ol class="dev-steps">${PWA_IOS_STEPS.map(t=>`<li>${esc(t)}</li>`).join("")}</ol>`:""}),
  /* 外觀：設定清單最後一列的入口，內容跟主頁外觀層同一份（lookHTML） */
  look:()=>hubRun("外觀",()=>[],{foot:()=>lookHTML(false),mount:lookMount}),
  /* 學年與開學日：只有秘書處有這一列 */
  term:()=>hubRun("學年與開學日",()=>[
    {k:"year",ic:"cap",t:"學年",flow:()=>editBoardInfo("year")},
    {k:"term",ic:"flag",t:"開學日",flow:()=>editBoardInfo("term")}]),
  /* 網站管理：只有後台管理員（cloud.js 的 siteAdmin）看得到這一列。
     ui-09 N：「分享預覽」拿掉（主頁與看板的分享預覽統一寫在 index.html、home.html，要改就直接改 HTML；以前這裡會用 GitHub API 把 index.html 改回各部門自己的標題） */
  site:()=>hubRun("網站管理",()=>[
    {k:"cloud",ic:"cloud",t:"雲端同步",
      flow:async()=>{const before=JSON.stringify(state);const ok=await cloudSettings();if(ok&&!editing&&JSON.stringify(state)!==before)await settingSave(()=>{},"雲端設定已更新");else render()}},
    /* 全會密碼與自動開通、重置測試部門（provision.js） */
    ...(cloudOn()&&ghToken()?[{k:"allpw",ic:"people",t:"全會密碼",flow:()=>allPwSet()},
      ...BOARD_DEPTS.filter(d=>d.test).map(d=>({k:"reset-"+d.id,ic:"history",t:`重置${d.name}（測試）`,flow:()=>pvReset(d.id)}))]:[])],
    {head:()=>{const c=cloudCfg();return hubSt([["雲端同步",cloudOn()?`${c.owner}/${c.repo}・${ghToken()?"這台裝置已連上":"這台裝置還沒有權杖"}`:"尚未設定"]])}}),   /* 雲端同步的 repo 與這台裝置的權杖狀態（改完設定回到這一頁時重畫） */
};
/* 有下一層的項目（桌面版放右側面板、手機進子頁） */
const SET_FLOWS={
  report:()=>reportDialog(),
  log:()=>openLog(setPaneHost()),
  team:()=>teamSettings(),
  labels:()=>labelSettings(),
  guide:()=>guideOpen(),
  ...SET_HUBS,
  ...ACCT_FLOWS,
};
document.addEventListener("click",async e=>{
  if(!e.target.closest)return;
  if(e.target.closest("#setOv [data-set-login]")){if(await ensureLogin()){renderSettings();render()}return}   /* 登入後看板上的「編輯」鈕才出現（body.authed） */
  const r=e.target.closest("#setOv [data-set]");if(!r)return;
  const k=r.dataset.set;
  if(r.getAttribute("aria-disabled")==="true"||(k!=="device"&&k!=="look"&&k!=="guide"&&!ACCT_FLOWS[k]&&!loggedIn())||!SET_FLOWS[k])return;   /* 登入前、唯讀時清單上的「外觀」「使用說明」不用登入；帳號、系統管理看 Google 登入（account.js） */
  if(!PANE_MQ.matches){await subRun(SET_FLOWS[k]);return}   /* 手機：進到下一層全畫面子頁 */
  if(k===paneKey){await paneClose();return}   /* 再點一次選到的項目＝收起 */
  await paneRun(k,SET_FLOWS[k]);
});
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape"||!setOpen)return;
  const d=$("#dlg"),lg=$("#logOv");
  if(d.open&&!d.classList.contains("in-pane"))return;   /* 跳出的對話框自己處理 */
  if(lg&&!lg.hidden)return;                              /* 編輯紀錄自己處理（team.js） */
  if(hubNow&&hubNow.inFlow){paneDismiss();return}   /* 合併頁裡開著的功能：先回到合併頁 */
  if(paneKey){paneClose();return}
  if(subOpen){paneDismiss();return}
  closeSettings();
});

/* ---------- 拉到底的回彈（iPhone 本來就有，就不重複） ---------- */
function elastic(sc,inner,skip){
  if(IS_IOS||!sc||!inner||sc._elastic)return;sc._elastic=true;
  let off=0,acc=0,tm=0,y0=null,x0=0,axis="",base=0,anim=null;
  const set=v=>{off=v;inner.style.transform=v?`translate3d(0,${v.toFixed(1)}px,0)`:""};
  const rub=d=>Math.sign(d)*Math.min(120,Math.pow(Math.abs(d),.8)*1.15);
  const back=()=>{if(!off)return;const from=off;set(0);if(reduceMotion())return;anim&&anim.cancel();anim=inner.animate([{transform:`translate3d(0,${from}px,0)`},{transform:"translate3d(0,0,0)"}],{duration:620,easing:"cubic-bezier(.16,1.35,.4,1)"})};
  const atTop=()=>sc.scrollTop<=0,atBot=()=>sc.scrollTop+sc.clientHeight>=sc.scrollHeight-1;
  sc.addEventListener("wheel",e=>{
    if((skip&&skip())||e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.target.closest("[data-own-gesture]"))return;   /* 自己用滾輪／拖曳的區塊（完成紀錄的週方塊列、週卡堆）：頁面不跟著回彈，不然每滾一格整頁抖一下 */
    if((e.deltaY<0&&atTop())||(e.deltaY>0&&atBot())){anim&&anim.cancel();acc=Math.max(-260,Math.min(260,acc-e.deltaY*.45));set(rub(acc));clearTimeout(tm);tm=setTimeout(()=>{acc=0;back()},120)}
  },{passive:true});
  sc.addEventListener("touchstart",e=>{if((skip&&skip())||e.touches.length!==1||e.target.closest("[data-own-gesture]")){y0=null;return}y0=e.touches[0].clientY;x0=e.touches[0].clientX;axis="";base=null},{passive:true});
  sc.addEventListener("touchmove",e=>{
    if(y0===null)return;
    if(document.documentElement.classList.contains("ev-drag-on")){if(off)set(0);return}   /* 膠囊拖到角落（live.js）時手指的上下移動是拖曳，不是拉頁面：不回彈，不然整頁會被拉走、頁面多出一個疊層把完成／刪除角落蓋住 */
    const y=e.touches[0].clientY,dy=y-y0;
    /* 先判斷方向：橫向的手勢（例如左右滑甘特圖）整段都不管，不然頁面剛好在頂端／底端時會把橫向捲動擋掉 */
    if(!axis){const dx=e.touches[0].clientX-x0;if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;axis=Math.abs(dx)>Math.abs(dy)?"x":"y"}
    if(axis==="x")return;
    if((dy>0&&atTop())||(dy<0&&atBot())){if(base===null)base=dy;if(e.cancelable)e.preventDefault();anim&&anim.cancel();set(rub(dy-base))}
    else if(off){set(0)}
  },{passive:false});
  const up=()=>{y0=null;base=null;back()};
  sc.addEventListener("touchend",up);sc.addEventListener("touchcancel",up);
}
elastic($("#pageMain"),document.querySelector("#pageMain .wrap"),()=>PHONE_MQ.matches);   /* 手機整頁不捲動，回彈交給下面的資訊區 */
elastic($("#wrapSc"),$("#wrapIn"),()=>!PHONE_MQ.matches);
{const ws=$("#wrapSc"),wp=document.querySelector("#pageMain .wrap");   /* 手機：資訊區捲離最上面才顯示搜尋列下緣的淡出 */
  if(ws&&wp)ws.addEventListener("scroll",()=>wp.classList.toggle("sc-run",ws.scrollTop>2),{passive:true})}
