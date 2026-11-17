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
  /* 換焦點：原地換 class，不重畫（重畫會讓放大、焦點框都變成直接跳）；超過兩端＝整列頂一下再彈回（拉過頭的回彈） */
  function setFoc(i,how){
    const want=i;i=Math.max(0,Math.min(D.length-1,i));
    if(i===H.i){if(want!==i)bump(want<i?-1:1);return}
    H.i=i;
    if(H.mode==="rail"){
      stage.querySelectorAll(".hm-tile").forEach(t=>{const on=+t.dataset.i===i;t.classList.toggle("on",on);t.tabIndex=on?0:-1;if(on)t.setAttribute("aria-current","true");else t.removeAttribute("aria-current")});
      ringTo(true);const on=stage.querySelector(".hm-tile.on");
      if(on){if(how==="key")on.focus({preventScroll:true});on.scrollIntoView({inline:"center",block:"nearest",behavior:reduceMotion()?"auto":"smooth"})}
    }
  }
  /* 拉過頭：內容沿拉動方向被拉開一點並微微拉伸，放開用彈簧彈回（只動 transform） */
  function bump(dir){
    const n=$id("hmRail");if(!n||reduceMotion()||n._bump)return;
    const org=dir<0?"0 50%":"100% 50%";
    n._bump=n.animate([{transform:"none",transformOrigin:org},{transform:`translateX(${-dir*26}px) scaleX(1.02)`,transformOrigin:org,offset:.22},{transform:"none",transformOrigin:org}],{duration:620,easing:"cubic-bezier(.16,1.35,.4,1)"});
    n._bump.finished.catch(()=>{}).then(()=>{n._bump=null});
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

  /* ---------- 畫面：桌面／手機各自一套，跨過 640px 時重畫 ---------- */
  function paint(){
    const m=PHONE.matches?"wal":"rail";H.mode=m;
    if(m==="rail"){stage.innerHTML=railHTML();railBind();ringTo(false);const on=stage.querySelector(".hm-tile.on");if(on)on.scrollIntoView({inline:"center",block:"nearest"})}
    logosFill();countsPaint();
  }
  PHONE.addEventListener("change",paint);
  addEventListener("resize",()=>{if(H.mode==="rail")ringTo(false)});
  if(document.fonts)document.fonts.ready.then(()=>{if(H.mode==="rail")ringTo(false)});

  /* 滾輪（桌面）：一格換一張（每 170ms 最多一次）；方向鍵：左右（桌面）；Enter 在色塊上＝點擊 */
  let wheelAt=0;
  document.addEventListener("wheel",e=>{
    if(H.mode!=="rail"||e.ctrlKey||!e.target.closest||!e.target.closest("#hm")||hmLayerOpen())return;
    const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!d)return;e.preventDefault();
    const now=performance.now();if(now-wheelAt<170)return;wheelAt=now;setFoc(H.i+(d>0?1:-1));
  },{passive:false});
  document.addEventListener("keydown",e=>{
    if(hmLayerOpen()||e.altKey||e.ctrlKey||e.metaKey||(e.target.closest&&e.target.closest("input,textarea")))return;
    const k=H.mode==="rail"?{ArrowRight:1,ArrowLeft:-1}[e.key]:{ArrowDown:1,ArrowUp:-1}[e.key];
    if(k){e.preventDefault();setFoc(H.i+k,"key")}
  });

  /* ---------- 進部門 ---------- */
  function hmEnter(i){const d=D[i];if(d)location.href=href(d)}

  /* 疊層（全會行事曆、外觀）開著嗎 */
  function hmLayerOpen(){return false}

  paint();hmCounts();
  splashOut();   /* 開場動畫播完（字型好了、至少 0.6 秒）才淡出（core/js/splash.js） */
})();
