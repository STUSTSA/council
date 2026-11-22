/* 核心｜主頁（home.html；DESIGN-next 第六節「主頁」、第五節「整頁過場」「彈簧與回彈」「部門標誌」）
   主頁只有：左上橫式學生會標誌、時間、設定、部門色塊、下排。工具列、通知、逾期數字都要進部門才看得到。
   - 桌面（641px 以上）：一排橫向色塊，焦點那塊放大，整列共用一個焦點框（.hm-ring）滑到新的那張；滾輪、方向鍵、點擊切換；點焦點那張＝進部門。
   - 手機（640px 以下）：錢包式卡片堆（見下面 WAL）。
   - 色塊內容：英文小標、部門名、部門標誌（dept/icons/dept-代號.svg 放進頁面裡，零件才能動；被選到時小人做一次動作，board.css「部門標誌」段）、
     進行中的即時回報張數（進主頁時讀一次，見 hmCounts）。
   - 下排：全會行事曆圓鈕、「預約會長」膠囊鈕（進你的部門看板、打開行事曆的會長室模式（沒記到部門時到會長室頁））、個人常用連結（只存這台裝置的 localStorage「stustsa-links」）、「+」編輯（見「下排」那一段）。
   - 「專案」：資料裡沒有專案這種單位（模擬頁把它當成跟部門同級），這一步不放部門／專案切換。
   這個檔不依賴看板的 state、store、登入（主頁只載入 config、util、morph、anim、icons，與行事曆用的 store、follow、notify）。 */
(()=>{
  const D=[...(window.BOARD_DEPTS||[])].sort((a,b)=>(b.id==="president")-(a.id==="president")||(b.id==="secretariat")-(a.id==="secretariat"));   /* 會長室、秘書處排最前面，其他照設定檔 */
  const PHONE=matchMedia("(max-width:640px)"),$id=id=>document.getElementById(id);
  const href=d=>`index.html?d=${encodeURIComponent(d.id)}`;
  const EN=id=>DEPT_EN[id]||"";
  const stage=$id("hmStage");
  /* 焦點：預設是權益部（網址沒有 ?d 的看板）；從某個部門回來時是那個部門（FROM）：
     系統返回鍵回來（back_forward）看 home.html 開頭放的 html[data-hm-back]（sessionStorage「hm-dept」，進部門時記下，只接受部門清單裡有的），
     其他從看板換頁過來的看 referrer 的 ?d */
  const H={i:Math.max(0,D.findIndex(d=>d.id==="rights")),cnt:{},svg:{},mode:""};
  const hmFrom=()=>{const b=document.documentElement.dataset.hmBack,bi=b?D.findIndex(d=>d.id===b):-1;if(bi>=0)return bi;
    try{const r=document.referrer&&new URL(document.referrer);if(!r||r.origin!==location.origin||!/\/(index\.html)?$/.test(r.pathname))return -1;const id=r.searchParams.get("d")||"rights";return D.findIndex(d=>d.id===id)}catch(_){return -1}};
  const FROM=hmFrom();if(FROM>=0)H.i=FROM;
  const tileIn=(d,i)=>`<span class="hm-tt"><i class="hm-en">${esc(EN(d.id))}</i><b class="hm-nm">${esc(d.name)}</b></span><span class="hm-lg" data-lg="${esc(d.id)}" aria-hidden="true"></span><span class="hm-n num" data-n="${esc(d.id)}" hidden></span>`;

  /* ---------- 左上的學生會標誌、時間、設定鈕 ---------- */
  $id("hmMe").innerHTML=suLogoH("hm-su");
  $id("hmSet").innerHTML=ico("palette","solo");
  const clock=$id("hmClock");let clockT=0;
  function tick(){const d=new Date();clock.textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}`;clearTimeout(clockT);if(!document.hidden)clockT=setTimeout(tick,60050-d.getSeconds()*1000-d.getMilliseconds())}
  document.addEventListener("visibilitychange",tick);tick();

  /* ---------- 部門標誌：讀 SVG 檔，放進色塊裡（同一個檔案只讀一次） ---------- */
  const svgLoad=id=>H.svg[id]||(H.svg[id]=PageFx.svg(deptLogo(id)));   /* 讀檔、解析在 pagefx.js（看板開頁的底板也用） */
  function logosFill(){stage.querySelectorAll(".hm-lg[data-lg]").forEach(h=>{if(h.firstChild)return;svgLoad(h.dataset.lg).then(s=>{if(s&&!h.firstChild)h.append(s.cloneNode(true))})})}

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
    if(!(H.mode==="wal"&&WAL.lock)&&i!==(H.mode==="wal"?WAL.f:H.i)){Sfx.play(how==="wheel"?"roll":"move");WAL.snd=false}   /* 音效：點、方向鍵＝移動焦點，滾輪一格＝滾動；WAL.snd＝手指拖、甩出去的期間，卡片堆每過一張響一次滾動（walDraw） */
    if(H.mode==="wal"){if(WAL.lock)return;if(i===WAL.f&&want!==i){WAL.v+=want<i?-2.6:2.6;WAL.run();return}WAL.f=i;WAL.run();if(how==="key")WAL.focus(i);return}
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
     動作引擎在 core/js/wallet.js（完成紀錄的週卡片共用同一份）；這裡只決定畫什麼（部門）與點了焦點卡要做什麼（進入部門）。 */
  const WAL=Wallet.make({onShow:rf=>{H.i=rf},onEnter:i=>hmEnter(i)});
  function walHTML(){return `<nav class="hm-wal" id="hmWal" aria-label="部門">${D.map((d,i)=>`<a class="hm-wc" data-i="${i}" href="${href(d)}" tabindex="-1">${tileIn(d,i)}</a>`).join("")}</nav>`}
  /* ---------- 畫面：桌面／手機各自一套，跨過 640px 時重畫 ---------- */
  function paint(){
    const m=PHONE.matches?"wal":"rail";H.mode=m;
    cancelAnimationFrame(WAL.raf);WAL.raf=0;WAL.d=null;
    if(m==="rail"){stage.innerHTML=railHTML();railBind();ringTo(false);const on=stage.querySelector(".hm-tile.on");if(on)on.scrollIntoView({inline:"center",block:"nearest"})}
    else{stage.innerHTML=walHTML();WAL.bind($id("hmWal"),H.i)}
    logosFill();countsPaint();
  }
  PHONE.addEventListener("change",paint);
  addEventListener("resize",()=>{if(H.mode==="rail")ringTo(false)});
  if(document.fonts)document.fonts.ready.then(()=>{if(H.mode==="rail")ringTo(false)});

  /* 滾輪：一格換一張（每 170ms 最多一次；到兩端頂一下再彈回）；方向鍵：左右（桌面）、上下（手機）；Enter 在色塊上＝點擊 */
  let wheelAt=0;
  document.addEventListener("wheel",e=>{
    if(e.ctrlKey||!e.target.closest||!e.target.closest("#hm")||e.target.closest("#hmDkIn.sc")||hmLayerOpen())return;   /* 下排放不下（.sc，可橫捲）時在它上面滾＝捲下排，不換部門 */
    const d=H.mode==="wal"?e.deltaY:Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!d)return;e.preventDefault();
    const now=performance.now();if(now-wheelAt<170)return;wheelAt=now;setFoc((H.mode==="wal"?WAL.f:H.i)+(d>0?1:-1),"wheel");
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
  /* 進部門提速（2026-11-21）：點下去的那一刻，請 Service Worker 先把看板的檔案跟網路對一遍（sw.js 的 warm；換頁後 15 秒內直接用這一份，不用再等一輪），
     並提前下載 Firebase 模組（store.js 的 storePreload）。沒有 Service Worker、不支援時什麼都不做，進部門照舊 */
  function hmWarm(){try{storePreload();const c=navigator.serviceWorker&&navigator.serviceWorker.controller;if(c)c.postMessage({type:"warm"})}catch(_){}}
  function hmEnter(i){
    const d=D[i];if(!d||H.busy)return;lkEdit(false);tipHide();const u=href(d),k=H.mode==="wal"?"flip":"tile";Sfx.play("enter");
    try{sessionStorage.setItem("hm-dept",d.id)}catch(_){}   /* 系統返回鍵回主頁（沒走 bfcache）時用來找回焦點（home.html 開頭） */
    hmWarm();   /* 過場動畫播的這一秒不浪費：看板的檔案與 Firebase 模組同時開始準備（動畫與換頁的時間都不變） */
    if(reduceMotion()){location.href=u;return}
    H.busy=true;const go=()=>{try{sessionStorage.setItem("pfx-burst",JSON.stringify({d:d.id,k}))}catch(_){}location.href=u};
    dockMove(false);   /* 下排跟主頁其他東西一起退場（桌面、手機都是） */
    if(k==="flip")walFlip(WAL.els[i],go);else tileExpand(stage.querySelector(`.hm-tile[data-i="${i}"]`),go);
  }
  /* 下排（.hm-dock）的退場與回來（DESIGN-next 第五節「整頁過場」；ui-09 O）：進部門＝往下沉並淡出（MO.base、出場曲線，停在退場後的樣子直到換頁）；
     回主頁＝從底部浮回來（柔回彈）。只動 transform／opacity；關掉動態時不動 */
  function dockMove(back){
    const x=document.querySelector(".hm-dock");if(!x||reduceMotion())return;
    x.getAnimations().forEach(a=>{if(a.id==="dock")a.cancel()});
    const cs=getComputedStyle(x).transform,B=cs&&cs!=="none"?" "+cs:"",up={transform:"translateY(0)"+B,opacity:1},down={transform:"translateY(32px)"+B,opacity:0};
    const a=back?x.animate([down,up],{duration:MO.layout,easing:MO.soft,fill:"backwards"}):x.animate([up,down],{duration:MO.base,easing:MO.out,fill:"forwards"});a.id="dock";
    if(back){x.dataset.fxOwn="";a.finished.catch(()=>{}).then(()=>{delete x.dataset.fxOwn})}   /* 回來時整頁浮上來（pagefx.js）不再挑它，柔回彈不被蓋掉 */
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
    document.querySelectorAll(".hm-top").forEach(x=>{const cs=getComputedStyle(x).transform,B=cs&&cs!=="none"?" "+cs:"";
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
    PageFx.onArrive(()=>{dockMove(true);const r2=t.getBoundingClientRect(),dx=r2.left-r.left,dy=r2.top-r.top,end=`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
      o.animate([{transform:c,opacity:1},{transform:end,opacity:1,offset:.82},{transform:end,opacity:0}],{duration:640,easing:"cubic-bezier(.3,1.45,.45,1)",fill:"forwards"}).finished.catch(()=>{}).then(()=>o.remove())});
  }
  /* 從看板按返回回到快取的這一頁（bfcache）：把進部門時留下的狀態清掉（分身、飛走的卡片、淡掉的東西），再收回那一張 */
  addEventListener("pageshow",e=>{
    if(!e.persisted)return;H.busy=false;WAL.lock=false;
    document.querySelectorAll(".hm-fx,.hm-fxl,.hm-flw").forEach(x=>x.remove());
    document.querySelectorAll("#hm,#hm *").forEach(x=>{x.getAnimations&&x.getAnimations().forEach(a=>{if(a instanceof CSSAnimation||a instanceof CSSTransition)return;a.cancel()});if(x.classList.contains("hm-wc"))x.style.visibility=""});
    if(H.mode==="wal")WAL.draw();
    if(document.documentElement.classList.contains("pfx-arrive"))hmCollapse();
  });

  /* ---------- 下排：全會行事曆圓鈕、個人常用連結（DESIGN-next 第六節「下排」，ui-08） ----------
     連結只存在這台裝置這個瀏覽器：localStorage「stustsa-links」＝[{u:網址, n:名稱}]（最多 LK_MAX 個；名稱可空＝顯示網域；最長 LK_NAME 字）。
     不存進帳號、不上傳，別的裝置、別的瀏覽器、別人都看不到。讀不到、壞掉、不是 http(s) 的一律略過（當成沒有）；localStorage 不能用時照樣能加，只是不會記住。
     網址只收 http(s)（沒寫通訊協定＝https；javascript:、data: 等其他協定不收）；名稱與網址進畫面一律經過 esc，打開用新分頁、不帶 opener 與 referrer。
     圖示（lkIco）：先向那個網站自己要 /favicon.ico；要不到再向 Google 的圖示服務要（只送網域）；兩邊都沒有顯示網域第一個字母（跟其他圓鈕一樣大的圓鈕；中文網域改用名稱第一個字，見 lkFirst）。不帶 referrer。
     內網／本機網域（IP、localhost、單段名、.local 等）兩步都不要，直接首字母。
     「+」＝進入編輯：連結右上角紅色 × 移除；輸入框左邊返回鍵、Esc、點下排以外＝結束編輯；Enter（或「加入」）＝加入，加完留在編輯中可以接著加。滿了「+」不出現。
     寬度改變（加、刪、進出編輯）：底板左右兩半（手機才畫；桌面是分開的圓鈕，ui-12）各自滑到新的邊、留著的按鈕滑到新位置、新的彈出來、拿掉的留分身淡出縮小（只動 transform／opacity）。
     桌面滑鼠停在連結上：圖示上方浮出名稱的小膠囊（#hmTip，不用 title）；手機（沒有 hover）不浮出 */
  const LK_KEY="stustsa-links",LK_MAX=12,LK_NAME=30,SOFT="cubic-bezier(.25,1.12,.4,1)",POP="cubic-bezier(.3,1.45,.45,1)";
  const lkCut=s=>[...String(s==null?"":s).trim()].slice(0,LK_NAME).join("");
  function lkUrl(raw){
    let s=String(raw==null?"":raw).trim();if(!s||s.length>2000)return null;
    if(!/^https?:\/\//i.test(s)){if(/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s))return null;s="https://"+s}   /* 「example.com:8080」的冒號後面是數字＝連接埠，不是協定 */
    let u;try{u=new URL(s)}catch(_){return null}
    return (u.protocol==="http:"||u.protocol==="https:")&&u.hostname&&!u.username&&!u.password?u.href:null;
  }
  const lkHost=u=>new URL(u).hostname.replace(/^www\./,"");
  let lkSeq=0;const lkKey=()=>"l"+(++lkSeq);   /* 畫面用的代號（同一個網址加兩次也分得開），不存 */
  let lkOk=true;   /* localStorage 讀寫都正常；讀不到或寫不進去（無痕、滿了）之後就只用畫面上這一份，不再拿存的那份來對（lkSync） */
  function lkRead(){
    let raw;try{raw=localStorage.getItem(LK_KEY)}catch(_){lkOk=false;return []}
    let a;try{a=JSON.parse(raw||"[]")}catch(_){a=[]}
    const out=[];if(!Array.isArray(a))return out;
    for(const x of a){if(out.length>=LK_MAX)break;const u=x&&typeof x==="object"&&lkUrl(x.u);if(u)out.push({u,n:typeof x.n==="string"?lkCut(x.n):"",k:lkKey()})}
    return out;
  }
  function lkWrite(){try{localStorage.setItem(LK_KEY,JSON.stringify(LK.list.map(({u,n})=>({u,n}))))}catch(_){lkOk=false}}
  /* 跟存的那份對齊（別的分頁可能改過）：同網址同名稱的沿用原本的畫面代號（節點、焦點不動），其餘換新；有變回傳 true。
     加、刪之前都先對一次，再寫回——編輯中收到別的分頁的修改時不會被這個分頁的舊清單整份蓋掉 */
  function lkSync(){
    if(!lkOk)return false;
    const nx=lkRead(),pool=LK.list.slice();
    if(!lkOk||nx.length===pool.length&&nx.every((x,i)=>x.u===pool[i].u&&x.n===pool[i].n))return false;
    nx.forEach(x=>{const i=pool.findIndex(o=>o.u===x.u&&o.n===x.n);if(i>=0)x.k=pool.splice(i,1)[0].k});
    LK.list=nx;return true;
  }
  const LK={list:lkRead(),ed:false},DKN=new Map(),dk=$id("hmDk"),dkIn=$id("hmDkIn"),dkBg=[dk.querySelector(".hm-dk-l>span"),dk.querySelector(".hm-dk-r>span")];
  DKN.set("pub",$id("hmPub"));DKN.set("bk",$id("hmBk"));
  /* 網站圖示：依序試 網站自己的 /favicon.ico → Google 圖示服務（只送 hostname，encodeURIComponent；要 64px）→ 都沒有就留著首字母圓鈕。
     Google 拿不到圖示時回一張 16×16 的預設地球（狀態可能是 404，瀏覽器照樣 load）：要 64 卻回兩邊都不超過 16 的圖＝當成沒有。
     （網站真的只有 16px 圖示、又不放在 /favicon.ico 時也會被當成沒有，顯示首字母；見交接說明一百零五。）
     任何一步回寬或高 ≤ 2 的極小圖（1×1 透明佔位）也當成沒有，往下一步。
     內網／本機網域（lkLan）兩步都不要：正式站是 https，向內網 http 要圖多半被擋，等於一定把內部名稱送給 Google。
     連結在載入中被移除（節點不在畫面上了）：拿掉 src 停下來，不往下一步、不寫快取（dkPaint 移除時也先拿掉還沒載到的圖）。
     載到後連結節點加 class「fav」（藏首字母、顯示圖）；不要用「ico」：那是全站 SVG 圖示的 class（board.css「圖示」段），會把 44px 的連結框縮成 1.15em、整顆往下偏（ui-10）。
     結果只記在記憶體（LK_ICO：網站 origin → 載到的圖片網址，"" ＝兩邊都沒有），重畫、同網站的連結不重複要；不存 */
  const LK_G="https://www.google.com/s2/favicons?domain=",LK_ICO=new Map();
  /* IP（URL 解析後 IPv4 一定是四段數字、IPv6 用 [] 包起來）、localhost、沒有點的單段名、保留給內網的字尾；結尾的點先去掉 */
  const lkLan=h=>{h=h.replace(/\.$/,"");return !h.includes(".")||h.startsWith("[")||/^\d+\.\d+\.\d+\.\d+$/.test(h)||/(^|\.)(localhost|local|internal|lan|home\.arpa)$/.test(h)};
  function lkIco(w,u){
    const p=new URL(u),key=p.origin,hit=LK_ICO.get(key);if(hit===""||lkLan(p.hostname))return;
    const srcs=hit?[hit]:[key+"/favicon.ico",LK_G+encodeURIComponent(p.hostname)+"&sz=64"];let i=0;
    const img=document.createElement("img");img.className="hm-lki";img.alt="";img.referrerPolicy="no-referrer";img.decoding="async";img.draggable=false;
    const dead=()=>{if(w.isConnected)return false;img.removeAttribute("src");img.remove();return true};
    const next=()=>{if(dead())return;if(++i<srcs.length)img.src=srcs[i];else{img.remove();if(!hit)LK_ICO.set(key,"")}};
    img.addEventListener("load",()=>{if(dead())return;
      const iw=img.naturalWidth,ih=img.naturalHeight;
      if(iw<=2||ih<=2||srcs[i].startsWith(LK_G)&&iw<=16&&ih<=16){next();return}
      if(!hit)LK_ICO.set(key,srcs[i]);w.classList.add("fav")});
    img.addEventListener("error",next);
    img.src=srcs[0];w.firstElementChild.append(img);
  }
  /* 首字（兩邊都沒有圖示、或內網網域時圓鈕上的字；ui-09 M2，DievE 11/19 定）：
     平常＝去掉 www. 的網域第一個字母（大寫）。只有這個字母會是 punycode 的 x 時（去掉 www. 之後的網域開頭是「xn--」，
     例如 例子.tw、中文.github.io）改用連結名稱的第一個字；只有後面幾段是中文（example.台灣、blog.例子.tw）首字母照樣取得到，維持網域首字母。
     new URL() 會把網域照 IDNA 正規化：中文等正規化後仍不是 ASCII 的字變成 punycode「xn--」；全形英數、全形句點會先變成半形 ASCII，不產生 xn--，走英數那條。
     名稱照字素切（Intl.Segmenter，沒有就 Array.from），emoji、組合字不切壞；照打的樣子，不轉大寫；開頭只由格式字元或空白組成的字素（零寬空格等）跳過。
     沒取名稱時維持網域第一個字母（punycode 的 X；交接說明一百零五「中文網域的首字母」待決定）：名稱空的、跳過格式字元後沒有字、
     或名稱本身就是這個網域（lkUrl 解得出網址、去掉 www. 與結尾點的 hostname 跟連結相同：例子.tw、www.例子.tw、https://例子.tw/、xn--fsqu00a.tw 都算） */
  const lkSeg=typeof Intl==="object"&&typeof Intl.Segmenter==="function"?new Intl.Segmenter(undefined,{granularity:"grapheme"}):null;
  const lkBlank=/^[\p{Cf}\p{Z}\s]+$/u;
  const lkG1=s=>{for(const g of lkSeg?Array.from(lkSeg.segment(s),x=>x.segment):Array.from(s))if(!lkBlank.test(g))return g;return ""};
  function lkFirst(x,h){
    if(/^xn--/.test(h)&&x.n){
      const bare=s=>s.replace(/\.$/,""),nu=lkUrl(x.n);
      if(!nu||bare(lkHost(nu))!==bare(h)){const c=lkG1(x.n);if(c)return c}
    }
    return h.charAt(0).toUpperCase();
  }
  function lkNode(x){
    const h=lkHost(x.u),nm=x.n||h,w=document.createElement("span");w.className="hm-lk";w.dataset.k=x.k;w.dataset.nm=nm;
    w.innerHTML=`<a class="hm-lkc" href="${esc(x.u)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(nm)}"><b class="hm-lkl" aria-hidden="true"></b></a>`;
    w.querySelector(".hm-lkl").textContent=lkFirst(x,h);
    lkIco(w,x.u);
    return w;
  }
  function dkNode(k){
    let n=DKN.get(k);if(n)return n;
    const x=LK.list.find(l=>l.k===k);
    if(x)n=lkNode(x);
    else{n=document.createElement(k==="dv"?"i":k==="form"?"span":"button");n.dataset.k=k;
      if(k==="dv"){n.className="hm-dv";n.setAttribute("aria-hidden","true")}
      else if(k==="add"){n.type="button";n.className="hm-lkadd";n.setAttribute("aria-label","編輯常用連結");n.innerHTML=ico("plus","solo")}
      else if(k==="back"){n.type="button";n.className="hm-lkb";n.setAttribute("aria-label","結束編輯");n.innerHTML=ico("back","solo")}
      else{n.className="hm-lkf";n.innerHTML=`<input class="hm-lku" id="hmLkU" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="https://" aria-label="網址"><input class="hm-lkn" id="hmLkN" type="text" autocomplete="off" maxlength="${LK_NAME}" enterkeyhint="done" placeholder="名稱" aria-label="名稱"><button type="button" class="primary hm-lkok">加入</button>`}}
    DKN.set(k,n);return n;
  }
  const dkKeys=()=>{const full=LK.list.length>=LK_MAX;return ["pub",...(D.some(d=>d.id==="president")?["bk"]:[]),"dv",...LK.list.map(x=>x.k),...(LK.ed?["back",...(full?[]:["form"])]:full?[]:["add"])]};
  /* 畫下排：沿用節點（照代號），只增減有變的；anim＝寬度與位置用動畫滑過去，show＝這一個要捲進可見範圍（手機、編輯中放不下時） */
  function dkPaint(anim,show){
    const keys=dkKeys(),R=anim&&!reduceMotion(),r0=new Map();let w0=0;
    if(R){w0=dk.getBoundingClientRect().width;[...dkIn.children].forEach(c=>r0.set(c.dataset.k,c.getBoundingClientRect()))}
    const gone=[...dkIn.children].filter(c=>!keys.includes(c.dataset.k));
    gone.forEach(c=>{c.remove();if(!c.classList.contains("hm-lk"))return;DKN.delete(c.dataset.k);
      const i=c.classList.contains("fav")?null:c.querySelector(".hm-lki");if(i){i.removeAttribute("src");i.remove()}});   /* 還沒載到的圖示停掉（不往下一步問 Google，也不讓下面的分身再要一次） */
    let at=dkIn.firstElementChild;keys.forEach(k=>{const n=dkNode(k);if(n===at)at=at.nextElementSibling;else dkIn.insertBefore(n,at)});   /* 只插入新的，沒動的節點不搬（焦點、動畫都留著） */
    LK.list.forEach(x=>{const n=DKN.get(x.k),b=n.querySelector(".hm-lkx");
      if(LK.ed&&!b){n.insertAdjacentHTML("beforeend",`<button type="button" class="hm-lkx" aria-label="移除 ${esc(n.dataset.nm)}">${ico("close","solo")}</button>`);if(R&&r0.has(x.k))n.lastElementChild.animate([{transform:"scale(0)"},{transform:"none"}],{duration:MO.base,easing:POP})}
      else if(!LK.ed&&b)b.remove()});
    dk.classList.toggle("ed",LK.ed);
    dkIn.classList.remove("sc");if(dkIn.scrollWidth>dkIn.clientWidth+1)dkIn.classList.add("sc");
    /* 放不下時盡量捲到最後（輸入框、「+」都看得到），但 show 那一個（返回鍵、剛加的連結）不能捲出左邊 */
    if(show){const n=DKN.get(show);if(n&&dkIn.classList.contains("sc"))dkIn.scrollLeft=Math.min(n.offsetLeft-8,dkIn.scrollWidth-dkIn.clientWidth)}
    if(!R)return;
    /* 底板兩半：中線不動，各自從原本的邊滑到新的邊 */
    const pr=dk.getBoundingClientRect(),dx=(pr.width-w0)/2;
    if(Math.abs(dx)>.5)dkBg.forEach((s,i)=>s.animate([{transform:`translateX(${(i?-dx:dx).toFixed(1)}px)`},{transform:"none"}],{duration:MO.layout,easing:SOFT}));
    keys.forEach(k=>{const n=DKN.get(k),a=r0.get(k);
      if(!a){n.animate([{opacity:0,transform:"scale(.6)"},{opacity:1,transform:"none"}],{duration:MO.base+40,delay:60,easing:POP,fill:"backwards"});return}
      const b=n.getBoundingClientRect(),d=a.left-b.left;if(Math.abs(d)>.5)n.animate([{transform:`translateX(${d.toFixed(1)}px)`},{transform:"none"}],{duration:MO.layout,easing:SOFT})});
    /* 拿掉的：留分身在原本的位置淡出縮小 */
    gone.forEach(c=>{const a=r0.get(c.dataset.k);if(!a)return;const g=c.cloneNode(true);g.querySelectorAll("[id]").forEach(x=>x.removeAttribute("id"));g.removeAttribute("data-k");g.inert=true;g.setAttribute("aria-hidden","true");
      g.style.cssText=`position:absolute;left:${(a.left-pr.left).toFixed(1)}px;top:${(a.top-pr.top).toFixed(1)}px;width:${a.width}px;height:${a.height}px;margin:0;pointer-events:none`;
      dk.append(g);g.animate([{opacity:1,transform:"none"},{opacity:0,transform:"scale(.6)"}],{duration:MO.base,easing:MO.in,fill:"forwards"}).finished.catch(()=>{}).then(()=>g.remove())});
  }
  function nope(el){el.setAttribute("aria-invalid","true");if(!reduceMotion())el.animate([{transform:"none"},{transform:"translateX(-6px)"},{transform:"translateX(5px)"},{transform:"translateX(-3px)"},{transform:"none"}],{duration:MO.slow,easing:"ease-out"})}
  function lkEdit(on){
    if(LK.ed===on)return;const had=dk.contains(document.activeElement);
    LK.ed=on;tipHide();
    if(!on){lkSync();const f=DKN.get("form");if(f)f.querySelectorAll("input").forEach(i=>{i.value="";i.removeAttribute("aria-invalid")})}
    dkPaint(true,on?"back":"add");
    if(on){const u=$id("hmLkU");(u||DKN.get("back")).focus({preventScroll:true})}
    else if(had)(dkIn.contains(DKN.get("add"))?DKN.get("add"):$id("hmPub")).focus({preventScroll:true});
  }
  function lkAdd(){
    const ui=$id("hmLkU"),ni=$id("hmLkN");if(!ui)return;
    const u=lkUrl(ui.value);if(!u){nope(ui);ui.focus({preventScroll:true});return}
    if(lkSync()&&LK.list.length>=LK_MAX){dkPaint(true);return}   /* 別的分頁加滿了：只換成最新的清單（輸入框收起） */
    if(LK.list.length>=LK_MAX)return;
    const x={u,n:lkCut(ni.value),k:lkKey()};LK.list.push(x);lkWrite();
    ui.value="";ni.value="";ui.removeAttribute("aria-invalid");
    dkPaint(true,x.k);
    const f=$id("hmLkU");(f&&dkIn.contains(f)?f:DKN.get("back")).focus({preventScroll:true});
  }
  function lkDel(k){
    lkSync();const i=LK.list.findIndex(x=>x.k===k);if(i>=0){LK.list.splice(i,1);lkWrite()}dkPaint(true);   /* 別的分頁已經刪掉同一個：只換成最新的清單 */
    const f=$id("hmLkU");(f&&dkIn.contains(f)?f:DKN.get("back")).focus({preventScroll:true});
  }
  dk.addEventListener("click",e=>{
    const t=e.target.closest&&e.target.closest("button");if(!t||!dk.contains(t))return;
    if(t.classList.contains("hm-lkadd"))lkEdit(true);
    else if(t.classList.contains("hm-lkb"))lkEdit(false);
    else if(t.classList.contains("hm-lkok"))lkAdd();
    else if(t.classList.contains("hm-lkx"))lkDel(t.closest(".hm-lk").dataset.k);
  });
  dk.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches&&e.target.matches(".hm-lkf input")&&!e.isComposing){e.preventDefault();lkAdd()}});
  dk.addEventListener("input",e=>{if(e.target.matches&&e.target.matches(".hm-lku"))e.target.removeAttribute("aria-invalid")});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!e.isComposing&&LK.ed&&!LY){e.preventDefault();lkEdit(false)}});   /* 注音選字中的 Esc 給輸入法，不結束編輯 */
  document.addEventListener("pointerdown",e=>{if(LK.ed&&!(e.target.closest&&e.target.closest("#hmDk")))lkEdit(false)},true);   /* 點下排以外＝結束編輯（那一下照樣算數） */
  addEventListener("storage",e=>{if(e.key!==LK_KEY&&e.key!==null)return;   /* 別的分頁改了：沒在編輯就跟著換；編輯中先不動畫面（加、刪、結束編輯時才對齊） */
    if(!LK.ed&&lkSync())dkPaint(false)});
  /* 名稱的小膠囊：只給有滑鼠的桌面（hover），圖示上方置中；換到別的連結時原地換字與位置，移開淡出 */
  const HOVER=matchMedia("(hover:hover) and (pointer:fine)");let tip=null;
  function tipShow(a){
    const w=a.closest(".hm-lk");if(!w||!HOVER.matches||LK.ed)return;
    if(!tip){tip=document.createElement("div");tip.className="hm-tip";tip.id="hmTip";tip.setAttribute("aria-hidden","true");document.body.append(tip)}
    const r=a.getBoundingClientRect();tip.textContent=w.dataset.nm;
    tip.style.transform=`translate(${(r.left+r.width/2).toFixed(1)}px,${(r.top-8).toFixed(1)}px) translate(-50%,-100%)`;tip.classList.add("on");
  }
  function tipHide(){if(tip)tip.classList.remove("on")}
  dk.addEventListener("pointerover",e=>{if(e.pointerType!=="mouse")return;const a=e.target.closest&&e.target.closest(".hm-lkc");if(a)tipShow(a)});
  dk.addEventListener("pointerout",e=>{const a=e.target.closest&&e.target.closest(".hm-lkc");if(a&&!a.contains(e.relatedTarget))tipHide()});
  dk.addEventListener("click",tipHide);dkIn.addEventListener("scroll",tipHide,{passive:true});
  addEventListener("resize",()=>{tipHide();dkIn.classList.remove("sc");if(dkIn.scrollWidth>dkIn.clientWidth+1)dkIn.classList.add("sc")});
  dkPaint(false);

  /* ---------- 疊層：全會行事曆（下排圓鈕）、外觀（設定鈕） ----------
     在主頁上蓋一層畫面；打開推一筆瀏覽紀錄，關閉鈕、Esc、系統返回鍵都關掉（關閉鈕與 Esc 走 history.back，由 popstate 真的關）。
     全會行事曆＝notify.js 的公共版 calMount(host)（全部／活動／會議，沒有今日／明日與逾期），關掉時 calUnmount(host) 拆掉
     （從 CALS 移除、拆掉分段切換的 LiquidSeg 與它的 resize 監聽、清空 host），整層也拿掉，下次打開重建。外觀＝theme.js 的 lookHTML（主題、深淺色、音效），整層留著下次再用 */
  const LYS={},LBL={cal:"全會行事曆",look:"外觀"};let LY=null;
  function hmLayerOpen(){return !!LY}
  function layerOpen(kind,opener){
    if(LY)return;lkEdit(false);
    let L=LYS[kind];
    if(!L){
      const el=document.createElement("div");el.className="hm-ly";el.id=kind==="cal"?"hmCal":"hmLook";el.hidden=true;
      el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-label",LBL[kind]);
      el.innerHTML=`<div class="hm-ly-in"><div class="hm-ly-bar"><button type="button" class="hm-round hm-ly-x" aria-label="關閉">${ico("close","solo")}</button></div><div class="hm-ly-body"></div></div>`;
      document.body.append(el);L=LYS[kind]={el,host:el.querySelector(".hm-ly-body")};
      el.querySelector(".hm-ly-x").addEventListener("click",()=>layerClose());
      el.hidden=false;
      if(kind==="cal")calMount(L.host);else{L.host.innerHTML=lookHTML(true);lookMount(L.host)}
    }else L.el.hidden=false;
    LY={kind,opener,...L};$id("hm").inert=true;Sfx.play("open");
    try{history.pushState({hmLayer:kind},"")}catch(_){}
    if(!reduceMotion()){L.el.animate([{opacity:0},{opacity:1}],{duration:MO.base,easing:MO.out});L.el.firstElementChild.animate([{transform:"translateY(28px)"},{transform:"none"}],{duration:MO.layout,easing:"cubic-bezier(.25,1.12,.4,1)"})}
    L.el.querySelector(".hm-ly-x").focus({preventScroll:true});
  }
  /* 關閉：fromPop＝瀏覽紀錄已經退了（popstate）；其他（關閉鈕、Esc）先退一筆，等 popstate 再關。
     返回音在使用者操作的當下響一次（關閉鈕的點擊預設音也是返回，同一個工作裡併成一次）；等到的 popstate 不再響（不管隔多久），系統返回鍵才在 popstate 響 */
  function layerClose(fromPop){
    if(!LY)return;
    if(!fromPop&&history.state&&history.state.hmLayer){if(LY.bk)return;LY.bk=true;Sfx.play("back");history.back();return}   /* 已經在退了：連按不再多退一筆 */
    const L=LY;LY=null;$id("hm").inert=false;if(!L.bk)Sfx.play("back");
    const done=()=>{L.el.hidden=true;if(L.kind==="cal"){calUnmount(L.host);L.el.remove();delete LYS.cal}};
    if(reduceMotion())done();
    else{L.el.animate([{opacity:1},{opacity:0}],{duration:MO.fast,easing:MO.in,fill:"forwards"}).finished.then(a=>{done();},()=>done()).then(()=>L.el.getAnimations().forEach(a=>a.cancel()));
      L.el.firstElementChild.animate([{transform:"none"},{transform:"translateY(16px)"}],{duration:MO.fast,easing:MO.in})}
    if(L.opener)L.opener.focus({preventScroll:true});
  }
  addEventListener("popstate",()=>{if(LY)layerClose(true)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&LY){e.preventDefault();layerClose()}});   /* 行事曆的月份選單開著時，它自己在捕獲階段先關選單（notify.js） */
  $id("hmPub").innerHTML=ico("calendar","solo");
  $id("hmBk").innerHTML=ico("clock","solo")+"<span>預約會長</span>";
  $id("hmBk").addEventListener("click",()=>{if(H.busy)return;H.busy=true;lkEdit(false);tipHide();Sfx.play("enter");hmWarm();   /* 直接進你的部門看板、打開行事曆的會長室模式：下排先退場再換頁，不做色塊放大（焦點不一定在會長室） */
    let mine="";try{mine=localStorage.getItem("stustsa-mydept")||""}catch(_){}
    const to=D.some(d=>d.id===mine&&d.id!=="president")?mine:"president";   /* 你的部門看板的行事曆「會長室」模式；還不知道你的部門時到會長室頁（那裡有指路） */
    try{sessionStorage.setItem("hm-dept",to)}catch(_){}
    const go=()=>{location.href=to==="president"?`index.html?d=president&tab=ext`:`index.html?d=${to}&noti=pres`};
    if(reduceMotion()){go();return}dockMove(false);setTimeout(go,MO.base)});
  $id("hmPub").addEventListener("click",e=>layerOpen("cal",e.currentTarget));
  $id("hmSet").addEventListener("click",e=>layerOpen("look",e.currentTarget));

  paint();hmCounts();
  setTimeout(()=>(window.requestIdleCallback||setTimeout)(storePreload),2500);   /* 開場與主頁動畫都過了、閒下來才提前下載 Firebase 模組（進部門時才下載會多等好幾趟網路來回；下載一次之後瀏覽器會留著） */
  swReg(D.map(d=>deptLogo(d.id)));   /* 安裝成 App、離線打開：主頁也註冊 Service Worker，並把主頁用到的檔案與九個部門標誌收進離線備份（util.js） */
  if(FROM>=0&&document.documentElement.classList.contains("pfx-arrive"))hmCollapse();
  splashOut(null,null,$id("hmMe").querySelector(".su-emb"));   /* 開場播完（字型好了、至少 0.6 秒）才收：兩個小人縮到左上角的標誌上（core/js/splash.js） */
})();
