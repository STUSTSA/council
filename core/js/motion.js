/* 核心｜展開收合與模式切換動畫 */
/* ---------- smooth mode switch (edit <-> view): morph instead of a hard cut ---------- */
function morph(fn){
  if(reduceMotion()){fn();return}
  const ease=EXPAND.easing,D=560;
  const lay=document.querySelector(".layout"),ly=lay.getBoundingClientRect().top;
  fn();
  const dy=ly-lay.getBoundingClientRect().top;
  if(Math.abs(dy)>1)lay.animate([{transform:`translateY(${dy}px)`},{transform:"none"}],{duration:D,easing:ease});
}
/* ---------- expand / collapse motion (app-launch style) ---------- */
const EXPAND={duration:560,easing:"cubic-bezier(.2,.9,.25,1)"};
function detailsBody(d){
  let kids=[...d.children].filter(k=>k.tagName!=="SUMMARY");
  if(kids.length===1&&kids[0].classList.contains("dwrap"))return kids[0];
  const w=document.createElement("div");w.className="dwrap";kids.forEach(k=>w.append(k));d.append(w);return w;
}
/* 有展開收合動畫進行時在 <html> 加 .motion-busy：頁面上其他一直在跑的小動畫（燈號擴散）先暫停，動畫才順 */
let _busy=0;
function motionBusy(n){_busy=Math.max(0,_busy+n);document.documentElement.classList.toggle("motion-busy",_busy>0)}
function animateDetails(d,open){
  (d._anims||[]).forEach(a=>a.cancel());d._anims=[];
  if(reduceMotion()){d.open=open;return}
  const rad=(r,h)=>Math.min(parseFloat(r)||0,h/2)+"px";
  const h0=d.offsetHeight,r0=rad(getComputedStyle(d).borderRadius,h0);
  if(open){d.open=true}
  const w=detailsBody(d);
  const full=w.scrollHeight;
  const cur=open?0:w.getBoundingClientRect().height;
  d.open=open;const h1=open?d.offsetHeight:h0-cur;const r1=rad(getComputedStyle(d).borderRadius,h1);
  d.open=true;
  d.classList.toggle("closing",!open);
  if(open){d.classList.add("opening");clearTimeout(d._ot);d._ot=setTimeout(()=>d.classList.remove("opening"),1400)}
  /* 手機焦點：即時回報展開那一下像被拿起來——放大一點、歪一點，再落回平的（不會一直歪，展開後文字照常好讀） */
  if(open&&d.matches(".ev")&&isPhone())d.animate([{scale:1,rotate:"0deg"},{scale:1.035,rotate:"-1.6deg",offset:.3},{scale:1,rotate:"0deg"}],{duration:640,easing:"cubic-bezier(.3,.7,.3,1)"});
  w.style.overflow="hidden";
  const wa=w.animate(open?[{height:"0px",opacity:0},{height:full+"px",opacity:1}]:[{height:cur+"px",opacity:1},{height:"0px",opacity:0}],{...EXPAND,duration:open?EXPAND.duration:380});
  const anims=[wa];
  if(r0!==r1)anims.push(d.animate([{borderRadius:r0},{borderRadius:r1}],{...EXPAND,duration:open?EXPAND.duration:380}));
  d._anims=anims;d.classList.add("animating");motionBusy(1);
  wa.onfinish=()=>{w.style.overflow="";d._anims=[];d.classList.remove("animating","closing");if(!open)d.open=false;motionBusy(-1)};
  wa.oncancel=()=>{w.style.overflow="";d.classList.remove("animating","closing");motionBusy(-1)};
}
document.addEventListener("click",e=>{
  const sm=e.target.closest("summary");if(!sm)return;
  const d=sm.parentElement;if(!d||!d.matches(".ev,.week,.log"))return;
  if(e.target.closest("input,button,a")){if(e.target.closest("summary button,summary input"))e.preventDefault();return}
  e.preventDefault();
  /* 手機：秘書處的報告事項、週報膠囊一次只開一張（打開這張時，同一區開著的其他張一起收起） */
  if(!d.open&&d.matches(".ev")&&isPhone()){const box=d.closest("#meetEdList,#wkBody");if(box)box.querySelectorAll(".ev[open]").forEach(o=>{if(o!==d)animateDetails(o,false)})}   /* 秘書處的報告事項、週報膠囊也照這條（2026-11-06 使用者：一次只能開一個） */
  animateDetails(d,!d.open);
},true);

/* open link buttons robustly: new tab first, fall back to same tab when a viewer blocks pop-ups */
document.addEventListener("click",e=>{
  const a=e.target.closest("a.link[href],a.lnk[href]");if(!a||a.closest(".sec-edit"))return;
  const url=a.getAttribute("href");if(!url||url==="#")return;
  e.preventDefault();e.stopPropagation();
  let w=null;try{w=window.open(url,"_blank")}catch(_){}
  if(w){try{w.opener=null}catch(_){}}
  else{try{window.top.location.href=url}catch(_){location.href=url}}
},true);

document.addEventListener("click",e=>{
  if(e.target.closest(".sec-edit"))return;const m=e.target.closest(".marker.quiet");if(!m)return;   /* 編輯中的議題：點註記是修改，不是偷看 */
  const tr=m.closest(".c-track");m.classList.add("peek");tr&&tr.classList.add("peeking");clearTimeout(m._pk);m._pk=setTimeout(()=>{m.classList.remove("peek");tr&&tr.classList.remove("peeking")},2200);
});
document.addEventListener("mouseover",e=>{const m=e.target.closest(".marker.quiet,.g-mk.quiet");const tr=m&&m.closest(".c-track,.g-track");document.querySelectorAll(".peeking").forEach(x=>{if(x!==tr)x.classList.remove("peeking")});if(tr)tr.classList.add("peeking")});

/* ---------- 版面長度過渡（全介面共用） ----------
   區塊（.panel）、設定頁的群組與右側面板，內容一變高或變矮，就從原本的高度滑到新的高度，下面的東西跟著滑，不會「卡一下整個往下」。
   用 ResizeObserver 看高度（在畫面畫出來之前就收到），所以各處的程式不用自己呼叫。
   不做的情況：裡面的膠囊／清單正在跑自己的展開收合（motionBusy）、第一次出現、從隱藏變顯示（高度 0）、寬度也一起變（換區塊放大、視窗縮放，交給原本的 FLIP）、減少動態、動畫模式。
   動畫進行中自己造成的尺寸變化不理；動畫結束後如果內容又變了，ResizeObserver 會再收到一次，從目前高度接著滑 */
/* 即時回報、完成紀錄兩塊（#livePanel、#donePanel）不做：過渡期間容器要 overflow:clip，會把超出區塊的東西裁掉——桌面左右分欄時詳情卡往上延伸到搜尋列那一行，
   每次開卡片、換卡片、新增都會看到卡片上面一截（標題那一排）不見、變成一塊空白（2026-11-25 回報）。這兩塊沒有外框、下面也沒有別的區塊，本來就看不出高度在滑（跟 board.css 的 contain 排除同一個理由） */
const FLOW_SEL=".panel:not(#livePanel):not(#donePanel),.ev[open],[data-flow],#setOv .set-list,#setOv .set-pane";   /* 動畫規則 1（anim.js）：新的容器加 data-flow 就有長度過渡 */
const flowLast=new WeakMap();
const flowRO=typeof ResizeObserver==="function"?new ResizeObserver(es=>{
  for(const e of es){
    const el=e.target;if(el._flow)continue;
    const bs=e.borderBoxSize&&e.borderBoxSize[0],w=bs?bs.inlineSize:el.offsetWidth,h=bs?bs.blockSize:el.offsetHeight,last=flowLast.get(el);
    flowLast.set(el,{w,h});
    if(!last||!last.h||!h||Math.abs(last.w-w)>1||Math.abs(last.h-h)<3||_busy||reduceMotion()||isPhone()||document.hidden||document.body.matches(".intro"))continue;   /* 手機不做高度動畫（DESIGN-next 第五節） */   /* _busy：膠囊自己在展開收合，區塊本來就跟著平滑變高 */
    el.style.overflow="clip";
    const a=el.animate([{height:last.h+"px"},{height:h+"px"}],{duration:Math.min(560,260+Math.abs(h-last.h)*.35),easing:"cubic-bezier(.2,.9,.25,1)"});
    el._flow=a;
    const done=()=>{if(el._flow!==a)return;el._flow=null;el.style.overflow="";flowLast.set(el,{w:el.offsetWidth,h:el.offsetHeight})};
    a.onfinish=done;a.oncancel=done;
  }
}):null;
function flowWatch(){if(flowRO)document.querySelectorAll(FLOW_SEL).forEach(el=>flowRO.observe(el))}
