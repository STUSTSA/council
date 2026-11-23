/* 錢包式卡片堆的動作引擎：手機主頁的部門卡片（home.js）與完成紀錄的週卡片（views.js）共用同一份，不各寫一套。
   只管位置、縮放、淡出、拖曳與彈簧；卡片要畫什麼、點了焦點卡要做什麼由呼叫的人給（onShow、onEnter）。
   卡片元素要有 class="hm-wc" 與 data-i（第幾張）。用法：const W=Wallet.make({onShow,onEnter}); W.bind(容器,起始張); W.f＝要停在哪張 */

const Wallet=(()=>{
  const WU=60,WH=196,WG=10,WDRAG=140;
  function make(o){
    const W={f:0,p:0,v:0,d:null,raf:0,lock:false,lr:null,els:[],snd:false,nav:null};
    W.draw=()=>{
      const els=W.els,p=W.p,y0=WU*Math.max(0,Math.min(p,2)),rf=Math.max(0,Math.min(els.length-1,Math.round(p)));
      els.forEach((el,i)=>{const d=i-p,y=d<=0?y0+Math.max(d,-2)*WU-(d<-2?Math.min(1,-2-d)*16:0):d<=1?y0+d*(WH+WG):y0+WH+WG+(d-1)*WU,sc=d<0?1+Math.max(d,-3)*.05:1;
        el.style.transform=`translate3d(0,${y.toFixed(1)}px,0) scale(${sc.toFixed(4)})`;el.style.opacity=d>=-2?"":Math.max(0,3+d).toFixed(3)});
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
  return {make,WH,WU,WG};
})();

/* 捲動縮疊（手機）：原本的手指捲動不變，清單項目（即時回報的膠囊 .cp、設定的列 .set-row）捲到上方固定區下面時不被切掉，
   而是停在固定區下緣、縮小疊起來——跟完成紀錄的週疊卡同一個視覺：新的在前面、舊的縮小（每層 .05，最多三層）露一條在上面。
   只寫 translate／scale／z-index（獨立屬性，不碰 transform，拖曳排序、點開成全螢幕、原位更新照舊）；不碰樣式與點擊。
   捲動容器：.page（即時回報頁）、.set-scroll、.set-sub-body（設定）；固定區下緣＝#dsRow（沒有就 #dTop）的底，設定層沒有固定區就用容器自己的上緣。
   拖曳排序中（html.ev-drag-on）、減少動態、桌面寬度一律不套用並還原。 */
const Pile=(()=>{
  const SC=".page,.set-scroll,.set-sub-body",IT=".cp,.set-row",LAY=3,PEEK=7,STEP=.05,GAP=10,PAD=14;
  let raf=0;
  const on=()=>matchMedia("(max-width:640px)").matches&&!reduceMotion()&&!document.documentElement.classList.contains("ev-drag-on");
  function clear(el){if(el._pl){el._pl=0;el._ty=0;el._s=1;el.style.translate=el.style.scale=""}}
  function run(sc){
    const its=[...sc.querySelectorAll(IT)];if(!its.length)return;
    if(!on()){its.forEach(el=>{clear(el);el.style.zIndex=""});return}
    const sr=sc.getBoundingClientRect();let edge=sr.top;
    if(sc.matches(".page")){const b=document.getElementById("dsRow")||document.getElementById("dTop");if(b&&b.offsetHeight)edge=Math.max(edge,b.getBoundingClientRect().bottom)}
    const P=edge+PAD;
    const m=its.map(el=>{const r=el.getBoundingClientRect(),h=el.offsetHeight,s=el._s||1;   /* 量到的位置先扣掉自己加上去的位移與縮放，才是排版的原位 */
      return {el,h,nat:r.top-(el._ty||0)-h*(1-s)/2}});
    let any=false;
    m.forEach(({el,h,nat},i)=>{
      const d=P-nat;
      if(d<=0||el.classList.contains("drag")){clear(el);return}
      any=true;const r=d/(h+GAP),ty=d-PEEK*Math.min(r,LAY-1),s=1-STEP*Math.min(r,LAY);
      el._pl=1;el._ty=ty;el._s=s;el.style.translate=`0 ${ty.toFixed(1)}px`;el.style.scale=s.toFixed(4)});
    m.forEach(({el},i)=>{el.style.zIndex=any?String(i+1):""});   /* 後面的在前面：滑進來的新項目蓋過已經疊起來的 */
  }
  const tick=sc=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>run(sc))};
  document.addEventListener("scroll",e=>{const t=e.target;if(t&&t.matches&&t.matches(SC))tick(t)},{capture:true,passive:true});
  addEventListener("resize",()=>document.querySelectorAll(SC).forEach(run));
  return {run};
})();
