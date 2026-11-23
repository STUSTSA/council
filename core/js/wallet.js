/* 錢包式卡片堆的動作引擎：手機主頁的部門卡片（home.js）與完成紀錄的週卡片（views.js）共用同一份，不各寫一套。
   只管位置、縮放、淡出、拖曳與彈簧；卡片要畫什麼、點了焦點卡要做什麼由呼叫的人給（onShow、onEnter）。
   卡片元素要有 class="hm-wc" 與 data-i（第幾張）。用法：const W=Wallet.make({onShow,onEnter}); W.bind(容器,起始張); W.f＝要停在哪張 */

const Wallet=(()=>{
  const WU0=60,WH0=196,WG0=10,WDRAG=140;
  function make(o){
    const WU=o.WU||WU0,WH=o.WH||WH0,WG=o.WG||WG0,ST=o.STEP==null?.05:o.STEP,BK=o.BK||2;   /* 間距、焦點卡高度、縮小幅度可由呼叫的人給（通知頁疊卡：每張完整露出不互蓋） */
    const W={f:0,p:0,v:0,d:null,raf:0,lock:false,lr:null,els:[],snd:false,nav:null};
    W.draw=()=>{
      const els=W.els,p=W.p,y0=WU*Math.max(0,Math.min(p,BK)),rf=Math.max(0,Math.min(els.length-1,Math.round(p)));
      els.forEach((el,i)=>{const d=i-p,y=d<=0?y0+Math.max(d,-BK)*WU-(d<-BK?Math.min(1,-BK-d)*16:0):d<=1?y0+d*(WH+WG):y0+WH+WG+(d-1)*WU,sc=d<0?1+Math.max(d,-3)*ST:1;
        el.style.transform=`translate3d(0,${y.toFixed(1)}px,0) scale(${sc.toFixed(4)})`;el.style.opacity=d>=-BK?"":Math.max(0,BK+1+d).toFixed(3)});
      if(W.lr!==rf){if(W.lr!=null&&W.snd)Sfx.play("roll");W.lr=rf;o.onShow&&o.onShow(rf,els);els.forEach((el,i)=>{const on=i===rf;el.style.zIndex=10+i;el.classList.toggle("on",on);el.tabIndex=on?0:-1;if(on)el.setAttribute("aria-current","true");else el.removeAttribute("aria-current")})}
    }
    W.run=()=>{
      cancelAnimationFrame(W.raf);
      if(reduceMotion()){W.p=W.f;W.v=0;W.raf=0;W.draw();return}
      let last=performance.now();const K=230,C=2*.74*Math.sqrt(K);
      const step=now=>{const dt=Math.min(.032,Math.max(.001,(now-last)/1000));last=now;for(let k=0;k<2;k++){W.v+=(-K*(W.p-W.f)-C*W.v)*dt/2;W.p+=W.v*dt/2}
        if(Math.abs(W.p-W.f)<.002&&Math.abs(W.v)<.02){W.p=W.f;W.v=0;W.raf=0;W.draw();return}W.draw();W.raf=requestAnimationFrame(step)};
      W.raf=requestAnimationFrame(step);
    }
    W.focus=i=>{const c=W.els[i];if(c)c.focus({preventScroll:true})};
    W.bind=(w,start)=>{
      W.nav=w;W.els=[...w.querySelectorAll(".hm-wc")];W.f=W.p=start||0;W.v=0;W.lr=null;W.draw();
      w.addEventListener("pointerdown",e=>{if(W.lock||e.button>0)return;cancelAnimationFrame(W.raf);W.raf=0;
        W.d={id:e.pointerId,y:e.clientY,p:W.p,moved:false,t:e.target.closest(".hm-wc"),ly:e.clientY,lt:e.timeStamp,vy:0};try{w.setPointerCapture(e.pointerId)}catch(_){}});
      w.addEventListener("pointermove",e=>{const d=W.d;if(!d||e.pointerId!==d.id)return;const dy=e.clientY-d.y;if(!d.moved&&Math.abs(dy)<6)return;d.moved=W.snd=true;
        const dt=e.timeStamp-d.lt;if(dt>0){d.vy=d.vy*.4+(e.clientY-d.ly)/dt*.6;d.ly=e.clientY;d.lt=e.timeStamp}
        const n=W.els.length;let q=d.p-dy/WDRAG;if(q<0)q*=.35;else if(q>n-1)q=n-1+(q-n+1)*.35;W.p=q;W.draw()});
      const up=e=>{const d=W.d;if(!d||e.pointerId!==d.id)return;W.d=null;const n=W.els.length;
        if(!d.moved){if(d.t&&e.type==="pointerup"){const i=+d.t.dataset.i;if(i===Math.round(W.f)&&Math.abs(W.p-W.f)<.2){o.onEnter(i);return}if(i!==W.f)Sfx.play("move");W.snd=false;W.f=i}W.run();return}
        const v=e.timeStamp-d.lt>90?0:d.vy,b=Math.round(d.p);   /* 手指停住才放開＝沒有速度 */
        let to=Math.round(W.p-v*170/WDRAG);if(to===b&&Math.abs(v)>.35)to=b+(v<0?1:-1);
        W.f=Math.max(0,Math.min(n-1,Math.max(b-3,Math.min(b+3,to))));W.v=-v*1000/WDRAG;W.run()};
      w.addEventListener("pointerup",up);w.addEventListener("pointercancel",up);
      /* 點擊：指標的點擊（detail 1 以上）已經在放開時處理，這裡只擋掉連結的預設動作；鍵盤 Enter（detail 0）＝進入焦點卡；按著 Ctrl／⌘ 的照連結預設（新分頁）。
         不用「放開後吃掉下一次點擊」的旗標：手指拖完放開不會有點擊，旗標會留著吃掉下一次 Enter（審查 P2） */
      w.addEventListener("click",e=>{const c=e.target.closest(".hm-wc");if(!c||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();
        if(e.detail===0&&+c.dataset.i===W.lr)o.onEnter(W.lr)});
    }
    return W;
  }
  return {make,WH:WH0,WU:WU0,WG:WG0};
})();

/* 捲動縮疊（手機，通知頁的日期卡 .cal-ev）：原本的手指捲動不變，卡片捲到上方固定區下面時不被切掉，停在固定區下緣、縮小疊起來——
   跟完成紀錄的週疊卡同一個視覺：新的在前面、舊的縮小（每層 .05，最多三層）露一條在上面。
   「釘在固定區下緣」交給瀏覽器的 position:sticky（board.css「手機通知頁卡片捲動縮疊」，跟著原生捲動在合成層上跑，不會落後半拍而抖動）；
   這裡只算縮小與露出的那一條（translate／scale 獨立屬性，不碰 transform，勾選、點擊、原位更新照舊）。
   每次捲動只量固定區與卡片所在清單的位置，各張的排版位置算好存起來（只在張數或尺寸變了才重算，不逐張量、沒有強制重排），只寫有變的幾張；
   看不到的清單（別的分頁）整個略過。減少動態、641px 以上不套用並還原。 */
const Pile=(()=>{
  const LAY=3,PEEK=7,STEP=.05,PAD=14,HOST="#notiPage .cal-list",ITEM=".cal-ev";
  let raf=0,dirty=true,ro=null,PT=0,hosts=[];
  const on=()=>matchMedia("(max-width:640px)").matches&&!reduceMotion();
  function put(el,ty,s){const k=ty.toFixed(1)+"|"+s.toFixed(3);if(el._pk===k)return;el._pk=k;
    if(s===1){el.style.translate=el.style.scale=""}else{el.style.translate=`0 ${ty.toFixed(1)}px`;el.style.scale=s.toFixed(3)}}
  /* 量一次（卡片張數、尺寸、固定區高度變了才重量；ResizeObserver 把 dirty 打開）：每張卡在捲動內容裡的位置與高度。
     捲動中只讀 scrollTop，不量任何東西（offsetTop 含 sticky 的位移，不能用，所以照排版順序累加高度與間距） */
  function measure(sc){
    dirty=false;hosts=[...sc.querySelectorAll(HOST)].filter(g=>g.offsetHeight);
    PT=PAD;   /* 標題列與搜尋列在捲動層外面，釘在捲動層上緣往下 PAD */
    sc.style.setProperty("--pile-top",PT+"px");
    const st=sc.scrollTop,t0=sc.getBoundingClientRect().top;
    hosts.forEach(g=>{
      if(ro&&!g._po_ro){g._po_ro=1;ro.observe(g)}
      const gap=parseFloat(getComputedStyle(g).rowGap)||0;let y=0;g._pn=[];g._pc=g.childElementCount;g._po=g.getBoundingClientRect().top-t0+st;
      [...g.children].forEach(k=>{const h=k.offsetHeight;if(k.matches(ITEM))g._pn.push([k,y,h]);y+=h+gap})})
  }
  function run(sc){
    if(typeof notiOpen==="undefined"||!notiOpen)return;   /* 通知頁沒開：不做事（別的分頁捲動時零成本） */
    if(dirty||!hosts.length||hosts.some(g=>!g.isConnected||g._pc!==g.childElementCount||!(g._pn[0]&&g._pn[0][0].isConnected)))measure(sc);
    if(!hosts.length)return;
    const st=sc.scrollTop,live=on();
    hosts.forEach(g=>{if(!g.offsetParent)return;   /* 清單不在畫面上（別的分頁）：略過 */
      g._pn.forEach(([el,n,h])=>{const d=live?PT+st-g._po-n:0;
        if(d<=0)put(el,0,1);else{const r=d/(h+12);put(el,-PEEK*Math.min(r,LAY-1),1-STEP*Math.min(r,LAY))}})})
  }
  const tick=sc=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>run(sc))};
  document.addEventListener("scroll",e=>{const t=e.target;if(t&&t.id==="wrapSc")tick(t)},{capture:true,passive:true});
  const redo=()=>{dirty=true;tick(document.getElementById("wrapSc"))};
  addEventListener("resize",redo);
  if(window.ResizeObserver)ro=new ResizeObserver(redo);
  return {run};
})();
