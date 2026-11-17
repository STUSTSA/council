/* 核心｜主頁（home.html；DESIGN-next 第六節「主頁」、第五節「整頁過場」「彈簧與回彈」「部門標誌」）
   主頁只有：左上橫式學生會標誌、時間、設定、部門色塊、下排。工具列、通知、逾期數字都要進部門才看得到。
   - 桌面（641px 以上）：一排橫向色塊，焦點那塊放大，整列共用一個焦點框（.hm-ring）滑到新的那張；滾輪、方向鍵、點擊切換；點焦點那張＝進部門。
   - 手機（640px 以下）：錢包式卡片堆（見下面 WAL）。
   - 色塊內容：英文小標、部門名、部門標誌（dept/icons/dept-代號.svg 放進頁面裡，零件才能動；被選到時小人做一次動作，board.css「部門標誌」段）、
     進行中的即時回報張數（進主頁時讀一次，見 hmCounts）。
   - 「專案」：資料裡沒有專案這種單位（模擬頁把它當成跟部門同級），這一步不放部門／專案切換。
   這個檔不依賴看板的 state、store、登入（主頁只載入 config、util、morph、anim、icons，與行事曆用的 store、follow、notify）。 */
(()=>{
  const D=[...(window.BOARD_DEPTS||[])].sort((a,b)=>(b.id==="president")-(a.id==="president")||(b.id==="secretariat")-(a.id==="secretariat"));   /* 會長室、秘書處排最前面，其他照設定檔 */
  const PHONE=matchMedia("(max-width:640px)"),$id=id=>document.getElementById(id);
  const href=d=>d.id==="rights"?"index.html":`index.html?d=${encodeURIComponent(d.id)}`;
  const EN=id=>DEPT_EN[id]||"";
  const stage=$id("hmStage");
  /* 焦點：預設是權益部（網址沒有 ?d 的看板）；從某個部門回來時是那個部門（hmFrom） */
  const H={i:Math.max(0,D.findIndex(d=>d.id==="rights")),cnt:{},svg:{},mode:""};
  const hmFrom=()=>{try{const r=document.referrer&&new URL(document.referrer);if(!r||r.origin!==location.origin||!/\/(index\.html)?$/.test(r.pathname))return -1;const id=r.searchParams.get("d")||"rights";return D.findIndex(d=>d.id===id)}catch(_){return -1}};
  {const f=hmFrom();if(f>=0)H.i=f}
  const tileIn=(d,i)=>`<span class="hm-tt"><i class="hm-en">${esc(EN(d.id))}</i><b class="hm-nm">${esc(d.name)}</b></span><span class="hm-lg" data-lg="${esc(d.id)}" aria-hidden="true"></span><span class="hm-n num" data-n="${esc(d.id)}" hidden></span>`;

  /* ---------- 左上的學生會標誌、時間、設定鈕 ---------- */
  $id("hmMe").innerHTML=suLogoH("hm-su");
  $id("hmSet").innerHTML=ico("sliders");
  const clock=$id("hmClock");let clockT=0;
  function tick(){const d=new Date();clock.textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}`;clearTimeout(clockT);if(!document.hidden)clockT=setTimeout(tick,60050-d.getSeconds()*1000-d.getMilliseconds())}
  document.addEventListener("visibilitychange",tick);tick();

  /* ---------- 部門標誌：讀 SVG 檔，放進色塊裡（同一個檔案只讀一次） ---------- */
  const svgLoad=id=>H.svg[id]||(H.svg[id]=fetch(deptLogo(id)).then(r=>r.ok?r.text():"").then(t=>{
    const doc=new DOMParser().parseFromString(t,"image/svg+xml"),s=doc.documentElement;return s&&s.nodeName==="svg"?s:null}).catch(()=>null));
  function logosFill(){stage.querySelectorAll(".hm-lg[data-lg]").forEach(h=>{if(h.firstChild)return;svgLoad(h.dataset.lg).then(s=>{if(s&&!h.firstChild){const n=document.importNode(s,true);n.setAttribute("aria-hidden","true");n.setAttribute("focusable","false");h.append(n)}})})}

  /* ---------- 進行中的張數：進主頁時讀一次 ----------
     資料檔（github、frozen 的部門）＝網站上的 data*.json，跟看板開頁讀的同一個檔（cache:no-cache，沒變就是 304）；
     已切到新資料庫（firestore）的部門要登入才讀得到、主頁沒有登入，不讀也不顯示（讀不到、沒有資料的也不顯示） */
  function hmCounts(){
    D.forEach(d=>{if(d.source==="firestore"||location.protocol==="file:")return;
      fetch(d.path,{cache:"no-cache"}).then(r=>r.ok?r.json():null).then(j=>{if(!j||!Array.isArray(j.events))return;
        H.cnt[d.id]=j.events.filter(e=>e&&!e.doneAt).length;countsPaint()}).catch(()=>{})});
  }
  function countsPaint(){stage.querySelectorAll("[data-n]").forEach(n=>{const v=H.cnt[n.dataset.n];if(v==null)return;const t=String(cssNum(v));if(n.textContent!==t)n.textContent=t;n.hidden=false})}

  /* ---------- 桌面：一排橫向色塊 ---------- */
  function railHTML(){
    return `<nav class="hm-rail" id="hmRail" aria-label="部門">${D.map((d,i)=>`<a class="hm-tile${i===H.i?" on":""}" data-i="${i}" href="${href(d)}" tabindex="${i===H.i?0:-1}"${i===H.i?' aria-current="true"':""}>${tileIn(d,i)}</a>`).join("")}<i class="hm-ring" id="hmRing" aria-hidden="true"></i></nav>`;
  }
  /* 焦點框：大小固定（每張色塊一樣大，只在版面改變時量），換焦點時只用 transform 滑過去 */
  function ringTo(anim){
    const r=$id("hmRing"),t=stage.querySelector(".hm-tile.on");if(!r||!t)return;
    const w=t.offsetWidth,h=t.offsetHeight,W=Math.round(w*1.13+14),Hh=Math.round(h*1.13+14);
    if(r.style.width!==W+"px"){r.style.width=W+"px";r.style.height=Hh+"px"}
    const tf=`translate(${(t.offsetLeft+w/2-W/2).toFixed(1)}px,${(t.offsetTop+h/2-Hh/2).toFixed(1)}px)`;if(r.style.transform===tf)return;
    if(!anim||reduceMotion()){r.style.transition="none";r.style.transform=tf;void r.offsetWidth;r.style.transition="";return}
    r.style.transform=tf;
  }
  /* 換焦點：原地換 class，不重畫（重畫會讓放大、焦點框都變成直接跳）；超過兩端＝頂一下再彈回（拉過頭的回彈） */
  function setFoc(i,how){
    const want=i;i=Math.max(0,Math.min(D.length-1,i));
    if(H.mode==="wal"){if(WAL.lock)return;if(i===WAL.f&&want!==i){WAL.v+=want<i?-2.6:2.6;walRun();return}WAL.f=i;walRun();if(how==="key")walFocus(i);return}
    if(i===H.i){if(want!==i)bump(want<i?-1:1);return}
    H.i=i;
    stage.querySelectorAll(".hm-tile").forEach(t=>{const on=+t.dataset.i===i;t.classList.toggle("on",on);t.tabIndex=on?0:-1;if(on)t.setAttribute("aria-current","true");else t.removeAttribute("aria-current")});
    ringTo(true);const on=stage.querySelector(".hm-tile.on");
    if(on){if(how==="key")on.focus({preventScroll:true});on.scrollIntoView({inline:"center",block:"nearest",behavior:reduceMotion()?"auto":"smooth"})}
  }
  /* 拉過頭：內容沿拉動方向被拉開一點並微微拉伸，放開用彈簧彈回（只動 transform） */
  function bump(dir){
    const n=$id("hmRail");if(!n||reduceMotion()||n._bump)return;
    n.style.transformOrigin=dir<0?"0 50%":"100% 50%";
    n._bump=n.animate([{transform:"none"},{transform:`translateX(${-dir*26}px) scaleX(1.02)`,offset:.22},{transform:"none"}],{duration:620,easing:"cubic-bezier(.16,1.35,.4,1)"});
    n._bump.finished.catch(()=>{}).then(()=>{n._bump=null;n.style.transformOrigin=""});
  }
  function railBind(){
    const rail=$id("hmRail");
    rail.addEventListener("click",e=>{
      const t=e.target.closest(".hm-tile");if(!t||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      e.preventDefault();const i=+t.dataset.i;
      if(i!==H.i){setFoc(i);return}
      hmEnter(i);
    });
  }


  /* ---------- 手機：錢包式卡片堆（DESIGN-next 第六節） ----------
     間距只有一條規律：焦點卡整張露出（WH 196），其餘每張只露同樣高的一條（WU 60）；退到後面的疊在上方（每退一張縮 5%，最多露兩張，
     第三張邊退邊淡掉），還沒輪到的疊在下方，焦點卡與下一張之間留 WG 10；整疊貼齊上緣（前面沒有卡時不留空）。
     WAL.f＝要停在哪一張，WAL.p＝畫面現在的位置：拖曳時跟著手指（每 WDRAG 140px 一張），放開後帶著手指的速度用彈簧滑到 f
     （勁度 230、阻尼比 .74），甩得快多走幾張（最多 3 張），拉過頭阻力 .35。點露出的那一條＝叫到焦點，點焦點卡＝進入。只動 transform／opacity */
  const WAL={f:0,p:0,v:0,d:null,raf:0,lock:false,lr:null,els:[]},WU=60,WH=196,WG=10,WDRAG=140;
  function walHTML(){return `<nav class="hm-wal" id="hmWal" aria-label="部門">${D.map((d,i)=>`<a class="hm-wc" data-i="${i}" href="${href(d)}" tabindex="-1">${tileIn(d,i)}</a>`).join("")}</nav>`}
  function walDraw(){
    const els=WAL.els,p=WAL.p,y0=WU*Math.max(0,Math.min(p,2)),rf=Math.max(0,Math.min(els.length-1,Math.round(p)));
    els.forEach((el,i)=>{const d=i-p,y=d<=0?y0+Math.max(d,-2)*WU-(d<-2?Math.min(1,-2-d)*16:0):d<=1?y0+d*(WH+WG):y0+WH+WG+(d-1)*WU,sc=d<0?1+Math.max(d,-3)*.05:1;
      el.style.transform=`translate3d(0,${y.toFixed(1)}px,0) scale(${sc.toFixed(4)})`;el.style.opacity=d>=-2?"":Math.max(0,3+d).toFixed(3)});
    if(WAL.lr!==rf){WAL.lr=rf;H.i=rf;els.forEach((el,i)=>{const on=i===rf;el.style.zIndex=10+i;el.classList.toggle("on",on);el.tabIndex=on?0:-1;if(on)el.setAttribute("aria-current","true");else el.removeAttribute("aria-current")})}
  }
  function walRun(){
    cancelAnimationFrame(WAL.raf);
    if(reduceMotion()){WAL.p=WAL.f;WAL.v=0;WAL.raf=0;walDraw();return}
    let last=performance.now();const K=230,C=2*.74*Math.sqrt(K);
    const step=now=>{const dt=Math.min(.032,Math.max(.001,(now-last)/1000));last=now;for(let k=0;k<2;k++){WAL.v+=(-K*(WAL.p-WAL.f)-C*WAL.v)*dt/2;WAL.p+=WAL.v*dt/2}
      if(Math.abs(WAL.p-WAL.f)<.002&&Math.abs(WAL.v)<.02){WAL.p=WAL.f;WAL.v=0;WAL.raf=0;walDraw();return}walDraw();WAL.raf=requestAnimationFrame(step)};
    WAL.raf=requestAnimationFrame(step);
  }
  const walFocus=i=>{const c=WAL.els[i];if(c)c.focus({preventScroll:true})};
  function walBind(){
    const w=$id("hmWal");WAL.els=[...w.querySelectorAll(".hm-wc")];WAL.f=WAL.p=H.i;WAL.v=0;WAL.lr=null;walDraw();
    w.addEventListener("pointerdown",e=>{if(WAL.lock||e.button>0)return;cancelAnimationFrame(WAL.raf);WAL.raf=0;
      WAL.d={id:e.pointerId,y:e.clientY,p:WAL.p,moved:false,t:e.target.closest(".hm-wc"),ly:e.clientY,lt:e.timeStamp,vy:0};try{w.setPointerCapture(e.pointerId)}catch(_){}});
    w.addEventListener("pointermove",e=>{const d=WAL.d;if(!d||e.pointerId!==d.id)return;const dy=e.clientY-d.y;if(!d.moved&&Math.abs(dy)<6)return;d.moved=true;
      const dt=e.timeStamp-d.lt;if(dt>0){d.vy=d.vy*.4+(e.clientY-d.ly)/dt*.6;d.ly=e.clientY;d.lt=e.timeStamp}
      const n=WAL.els.length;let q=d.p-dy/WDRAG;if(q<0)q*=.35;else if(q>n-1)q=n-1+(q-n+1)*.35;WAL.p=q;walDraw()});
    const up=e=>{const d=WAL.d;if(!d||e.pointerId!==d.id)return;WAL.d=null;const n=WAL.els.length;
      if(!d.moved){if(d.t&&e.type==="pointerup"){const i=+d.t.dataset.i;if(i===Math.round(WAL.f)&&Math.abs(WAL.p-WAL.f)<.2){WAL.tap=true;hmEnter(i);return}WAL.f=i}walRun();return}
      WAL.tap=true;   /* 拖完放開的那一下不是點擊 */
      const v=e.timeStamp-d.lt>90?0:d.vy,b=Math.round(d.p);   /* 手指停住才放開＝沒有速度 */
      let to=Math.round(WAL.p-v*170/WDRAG);if(to===b&&Math.abs(v)>.35)to=b+(v<0?1:-1);
      WAL.f=Math.max(0,Math.min(n-1,Math.max(b-3,Math.min(b+3,to))));WAL.v=-v*1000/WDRAG;walRun()};
    w.addEventListener("pointerup",up);w.addEventListener("pointercancel",up);
    /* 點擊：指標的點擊已經在放開時處理（WAL.tap），這裡只擋掉連結的預設動作；鍵盤 Enter（detail 0）＝進入焦點卡；按著 Ctrl／⌘ 的照連結預設（新分頁） */
    w.addEventListener("click",e=>{const c=e.target.closest(".hm-wc");if(!c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();
      if(WAL.tap){WAL.tap=false;return}if(e.detail===0&&+c.dataset.i===H.i)hmEnter(H.i)});
  }
  /* ---------- 畫面：桌面／手機各自一套，跨過 640px 時重畫 ---------- */
  function paint(){
    const m=PHONE.matches?"wal":"rail";H.mode=m;
    cancelAnimationFrame(WAL.raf);WAL.raf=0;WAL.d=null;
    if(m==="rail"){stage.innerHTML=railHTML();railBind();ringTo(false);const on=stage.querySelector(".hm-tile.on");if(on)on.scrollIntoView({inline:"center",block:"nearest"})}
    else{stage.innerHTML=walHTML();walBind()}
    logosFill();countsPaint();
  }
  PHONE.addEventListener("change",paint);
  addEventListener("resize",()=>{if(H.mode==="rail")ringTo(false)});
  if(document.fonts)document.fonts.ready.then(()=>{if(H.mode==="rail")ringTo(false)});

  /* 滾輪：一格換一張（每 170ms 最多一次；到兩端頂一下再彈回）；方向鍵：左右（桌面）、上下（手機）；Enter 在色塊上＝點擊 */
  let wheelAt=0;
  document.addEventListener("wheel",e=>{
    if(e.ctrlKey||!e.target.closest||!e.target.closest("#hm")||hmLayerOpen())return;
    const d=H.mode==="wal"?e.deltaY:Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!d)return;e.preventDefault();
    const now=performance.now();if(now-wheelAt<170)return;wheelAt=now;setFoc((H.mode==="wal"?WAL.f:H.i)+(d>0?1:-1));
  },{passive:false});
  document.addEventListener("keydown",e=>{
    if(hmLayerOpen()||e.altKey||e.ctrlKey||e.metaKey||(e.target.closest&&e.target.closest("input,textarea")))return;
    const k=H.mode==="rail"?{ArrowRight:1,ArrowLeft:-1}[e.key]:{ArrowDown:1,ArrowUp:-1}[e.key];
    if(k){e.preventDefault();setFoc((H.mode==="wal"?WAL.f:H.i)+k,"key")}
  });

  /* ---------- 進部門、回主頁（DESIGN-next 第五節「整頁過場」）。只動 transform／opacity，不用模糊 ----------
     跨頁：播完主頁這一半才換頁，交接 sessionStorage「pfx-burst」＝{d,k}（只給下一頁讀一次，index.html 開頭讀完就刪），
     看板開頁第一格就蓋著同一個終點畫面（pagefx.js 的 cover），等看板穩定了再接著播後半（桌面：底板淡出、區塊浮上來；手機：標誌淡出、區塊不規則浮現）。
     減少動態時直接換頁、不交接 */
  function hmEnter(i){
    const d=D[i];if(!d||H.busy)return;const u=href(d),k=H.mode==="wal"?"flip":"tile";
    if(reduceMotion()){location.href=u;return}
    H.busy=true;const go=()=>{try{sessionStorage.setItem("pfx-burst",JSON.stringify({d:d.id,k}))}catch(_){}location.href=u};
    if(k==="flip")walFlip(WAL.els[i],go);else tileExpand(stage.querySelector(`.hm-tile[data-i="${i}"]`),go);
  }
  /* 鋪滿畫面的那一張：從色塊的位置與圓角放大到蓋住整個畫面（往外多放一圈，放大後的圓角落在畫面外，不用動圓角） */
  function cover(r,rad){
    const W=innerWidth,Hh=innerHeight;let m=0,sx=1,sy=1;
    for(let k=0;k<5;k++){sx=(W+2*m)/r.width;sy=(Hh+2*m)/r.height;m=.3*rad*Math.max(sx,sy)+2}
    return `translate(${(-m-r.left).toFixed(1)}px,${(-m-r.top).toFixed(1)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
  }
  const lgEnd=()=>{const s=Math.min(innerWidth*.46,300);return {left:(innerWidth-s)/2,top:(innerHeight-s)/2,width:s,height:s}};
  const fxEl=(cls,r,rad)=>{const o=document.createElement("div");o.className=cls;o.setAttribute("aria-hidden","true");o.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px${rad!=null?`;border-radius:${rad}px`:""}`;return o};
  const lgTf=(a,b)=>`translate(${(b.left-a.left).toFixed(1)}px,${(b.top-a.top).toFixed(1)}px) scale(${(b.width/a.width).toFixed(4)})`;
  /* 桌面：被點的色塊連同標誌鋪滿畫面 */
  function tileExpand(t,then){
    if(!t){then();return}
    const r=t.getBoundingClientRect(),rad=parseFloat(getComputedStyle(t).borderRadius)*r.width/t.offsetWidth||18,o=fxEl("hm-fx",r,rad);
    const lg=t.querySelector(".hm-lg svg"),lr=lg&&lg.getBoundingClientRect(),E={duration:MO.slow,easing:MO.out,fill:"forwards"};
    document.body.append(o);
    let l=null;if(lg&&lr.width){l=fxEl("hm-fxl",lr);l.append(lg.cloneNode(true));document.body.append(l);l.animate([{transform:"none"},{transform:lgTf(lr,lgEnd())}],E)}
    o.animate([{transform:"none"},{transform:cover(r,rad)}],E).finished.then(then,then);
  }
  /* 手機：其他卡片先縮一下再各自帶偏移與旋轉往上下彈開（460ms），主頁其餘東西淡出 → 被點的卡片整張翻面、邊翻邊鋪滿
     （前半 230ms 卡片分身轉到側面，後半 430ms 畫面大小的底板帶部門標誌從側面轉正；延遲 200ms 起跑；側面那一瞬間換手，看不出來）。
     底板一開始就是最終大小（縮小來放），標誌不會糊、也不用非等比縮放 */
  function walFlip(el,then){
    if(!el){then();return}
    WAL.lock=true;cancelAnimationFrame(WAL.raf);WAL.raf=0;
    const W=innerWidth,Hh=innerHeight,r=el.getBoundingClientRect(),R=x=>(Math.random()*2-1)*x;
    WAL.els.forEach(o=>{if(o===el)return;const b=o.getBoundingClientRect(),up=b.top<r.top,base=o.style.transform||"none",op=getComputedStyle(o).opacity;
      o.animate([{transform:base,opacity:op},{offset:.22,transform:`translate(0,${up?10:-10}px) `+base,opacity:op},{transform:`translate(${R(110).toFixed(0)}px,${((up?-1:1)*(Hh*.6+Math.random()*140)).toFixed(0)}px) rotate(${R(16).toFixed(1)}deg) `+base,opacity:0}],
        {duration:460,delay:Math.min(90,Math.abs(b.top-r.top)*.18),easing:"cubic-bezier(.4,0,.75,.5)",fill:"forwards"})});
    document.querySelectorAll(".hm-top,.hm-dock").forEach(x=>{const cs=getComputedStyle(x).transform,B=cs&&cs!=="none"?" "+cs:"";
      x.animate([{opacity:1,transform:"translate(0,0)"+B},{opacity:0,transform:`translate(${R(26).toFixed(0)}px,${(-14+R(16)).toFixed(0)}px) scale(.94)`+B}],{duration:300,delay:Math.random()*90,easing:MO.in,fill:"forwards"})});
    const w=document.createElement("div"),ff=el.cloneNode(true),fb=document.createElement("div"),lg=el.querySelector(".hm-lg svg");
    w.className="hm-flw";w.setAttribute("aria-hidden","true");fb.className="hm-fb";ff.className="hm-wc hm-ff";ff.removeAttribute("aria-current");ff.removeAttribute("href");
    ff.style.cssText=`left:${r.left}px;top:${r.top}px;right:auto;width:${r.width}px;height:${r.height}px;transform:none;opacity:1;z-index:auto`;
    if(lg){const c=lg.cloneNode(true),e=lgEnd();c.setAttribute("class","dg hm-fbl");c.style.cssText=`left:${e.left}px;top:${e.top}px;width:${e.width}px;height:${e.height}px`;fb.append(c)}
    w.append(ff,fb);document.body.append(w);el.style.visibility="hidden";
    const dx=r.left+r.width/2-W/2,dy=r.top+r.height/2-Hh/2,sm=1.22,s0=r.width*sm/W,T0=200,T1=230,T2=430;
    ff.animate([{transform:"rotateY(0deg) scale(1)"},{transform:`translate(${(-dx*.3).toFixed(1)}px,${(-dy*.3).toFixed(1)}px) rotateY(90deg) scale(${sm})`}],{duration:T1,delay:T0,easing:"cubic-bezier(.5,0,.9,.55)",fill:"forwards"});
    fb.animate([{transform:`translate(${(dx*.7).toFixed(1)}px,${(dy*.7).toFixed(1)}px) rotateY(-90deg) scale(${s0.toFixed(3)})`},{transform:"none"}],{duration:T2,delay:T0+T1,easing:"cubic-bezier(.16,.84,.3,1.05)",fill:"both"})
      .finished.then(then,then);
  }
  /* 回主頁：整個畫面收回原本那一張（桌面焦點色塊、手機焦點卡；跟進去時的鋪滿倒著做），收到最後兩成淡掉。
     底板開頁第一格就蓋好（回來的那一刻不閃出主頁），跟著主頁浮上來（PageFx.onArrive）才開始收 */
  function hmCollapse(){
    if(reduceMotion())return;
    const t=H.mode==="wal"?WAL.els[H.i]:stage.querySelector(".hm-tile.on");if(!t)return;
    const r=t.getBoundingClientRect(),rad=parseFloat(getComputedStyle(t).borderRadius)*(r.width/t.offsetWidth)||18,o=fxEl("hm-fx",r,rad),c=cover(r,rad);
    o.style.transform=c;document.documentElement.append(o);
    PageFx.onArrive(()=>{const r2=t.getBoundingClientRect(),dx=r2.left-r.left,dy=r2.top-r.top,end=`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
      o.animate([{transform:c,opacity:1},{transform:end,opacity:1,offset:.82},{transform:end,opacity:0}],{duration:640,easing:"cubic-bezier(.3,1.45,.45,1)",fill:"forwards"}).finished.catch(()=>{}).then(()=>o.remove())});
  }
  /* 從看板按返回回到快取的這一頁（bfcache）：把進部門時留下的狀態清掉（分身、飛走的卡片、淡掉的東西），再收回那一張 */
  addEventListener("pageshow",e=>{
    if(!e.persisted)return;H.busy=false;WAL.lock=false;
    document.querySelectorAll(".hm-fx,.hm-fxl,.hm-flw").forEach(x=>x.remove());
    document.querySelectorAll("#hm,#hm *").forEach(x=>{x.getAnimations&&x.getAnimations().forEach(a=>{if(a instanceof CSSAnimation||a instanceof CSSTransition)return;a.cancel()});if(x.classList.contains("hm-wc"))x.style.visibility=""});
    if(H.mode==="wal")walDraw();
    if(document.documentElement.classList.contains("pfx-arrive"))hmCollapse();
  });

  /* ---------- 疊層：全會行事曆（下排圓鈕）、外觀（設定鈕） ----------
     在主頁上蓋一層畫面；打開推一筆瀏覽紀錄，關閉鈕、Esc、系統返回鍵都關掉（關閉鈕與 Esc 走 history.back，由 popstate 真的關）。
     全會行事曆＝notify.js 的公共版 calMount（全部／活動／會議，沒有今日／明日與逾期），關掉時 calUnmount 拆掉（解除分段切換的監聽）；
     還沒有 calUnmount 時整層留著下次再用，不會重複建分段切換。外觀＝theme.js 的 lookHTML（主題、深淺色、音效），整層留著下次再用 */
  const LYS={},LBL={cal:"全會行事曆",look:"外觀"};let LY=null;
  function hmLayerOpen(){return !!LY}
  function layerOpen(kind,opener){
    if(LY)return;
    let L=LYS[kind];
    if(!L){
      const el=document.createElement("div");el.className="hm-ly";el.id=kind==="cal"?"hmCal":"hmLook";el.hidden=true;
      el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-label",LBL[kind]);
      el.innerHTML=`<div class="hm-ly-in"><div class="hm-ly-bar"><button type="button" class="hm-round hm-ly-x" aria-label="關閉">${ico("close")}</button></div><div class="hm-ly-body"></div></div>`;
      document.body.append(el);L=LYS[kind]={el,host:el.querySelector(".hm-ly-body")};
      el.querySelector(".hm-ly-x").addEventListener("click",()=>layerClose());
      el.hidden=false;
      if(kind==="cal")calMount(L.host);else{L.host.innerHTML=lookHTML(true);lookMount(L.host)}
    }else L.el.hidden=false;
    LY={kind,opener,...L};$id("hm").inert=true;
    try{history.pushState({hmLayer:kind},"")}catch(_){}
    if(!reduceMotion()){L.el.animate([{opacity:0},{opacity:1}],{duration:MO.base,easing:MO.out});L.el.firstElementChild.animate([{transform:"translateY(28px)"},{transform:"none"}],{duration:MO.layout,easing:"cubic-bezier(.25,1.12,.4,1)"})}
    L.el.querySelector(".hm-ly-x").focus({preventScroll:true});
  }
  /* 關閉：fromPop＝瀏覽紀錄已經退了（popstate）；其他（關閉鈕、Esc）先退一筆，等 popstate 再關 */
  function layerClose(fromPop){
    if(!LY)return;
    if(!fromPop&&history.state&&history.state.hmLayer){history.back();return}
    const L=LY;LY=null;$id("hm").inert=false;
    const done=()=>{L.el.hidden=true;if(L.kind==="cal"&&typeof calUnmount==="function"){calUnmount(L.host);L.el.remove();delete LYS.cal}};
    if(reduceMotion())done();
    else{L.el.animate([{opacity:1},{opacity:0}],{duration:MO.fast,easing:MO.in,fill:"forwards"}).finished.then(a=>{done();},()=>done()).then(()=>L.el.getAnimations().forEach(a=>a.cancel()));
      L.el.firstElementChild.animate([{transform:"none"},{transform:"translateY(16px)"}],{duration:MO.fast,easing:MO.in})}
    if(L.opener)L.opener.focus({preventScroll:true});
  }
  addEventListener("popstate",()=>{if(LY)layerClose(true)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&LY){e.preventDefault();layerClose()}});   /* 行事曆的月份選單開著時，它自己在捕獲階段先關選單（notify.js） */
  $id("hmPub").innerHTML=ico("calendar");
  $id("hmPub").addEventListener("click",e=>layerOpen("cal",e.currentTarget));
  $id("hmSet").addEventListener("click",e=>layerOpen("look",e.currentTarget));

  paint();hmCounts();
  if(hmFrom()>=0&&document.documentElement.classList.contains("pfx-arrive"))hmCollapse();
  splashOut(null,null,$id("hmMe").querySelector(".su-emb"));   /* 開場播完（字型好了、至少 0.6 秒）才收：兩個小人縮到左上角的標誌上（core/js/splash.js） */
})();
