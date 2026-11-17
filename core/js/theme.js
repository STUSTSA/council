/* 核心｜外觀：主題、深淺色、音效開關（docs/DESIGN-next.md 第二節；看板 index.html 與總覽 home.html 都在 <head> 同步載入，開頁前就套好，不會閃一下）
   - 存在這台裝置的 localStorage，只有一個 key「stustsa-ui」：{pal:主題代號, mode:"light"|"dark"（沒選過＝沒有這一項）, sound:true|false}。
     不存進帳號、不上傳；別的裝置、別的瀏覽器看不到。讀不到、壞掉、值不對就用預設：主題米黃（fin）、深淺色跟系統、音效開。
   - 主題放在 <html data-pal>、深淺色放在 <html data-theme>（顏色在 core/theme.css）。沒選過深淺色時跟著系統，系統一換就跟著換。
   - meta theme-color 跟著目前的 --bg。
   - 換主題、換深淺色（UI.set）：整頁 140ms 等速淡過去（View Transitions，時間在 theme.css）；那一下各元件自己的顏色過渡直接跳到結果
     （分段鈕的鏡片是 anim.js 的彈簧、不是 CSS 過渡，照常滑）。淡的途中再點別的地方：淡出立刻結束，那一下照樣算數；按住拖走不算（見下面的 pointerdown）。
     不支援 View Transitions 或關掉動態時，整頁直接換。 */
const UI_KEY="stustsa-ui";
const UI_PALS=[["fin","米黃"],["b3","白藍"],["ink","黑白黃"],["sage","灰綠"],["mist","霧藍"],["fire","爐火"],["pastel","粉彩"],["neu","柔光"],["sun","暖陽"]];
const UI=(()=>{
  const root=document.documentElement,sys=matchMedia("(prefers-color-scheme: dark)");
  const clean=o=>{o=o&&typeof o==="object"&&!Array.isArray(o)?o:{};
    return {pal:UI_PALS.some(p=>p[0]===o.pal)?o.pal:"fin",mode:o.mode==="light"||o.mode==="dark"?o.mode:"",sound:o.sound!==false}};
  const read=()=>{try{return clean(JSON.parse(localStorage.getItem(UI_KEY)||"null"))}catch(_){return clean(null)}};
  const write=v=>{try{const o={pal:v.pal,sound:v.sound};if(v.mode)o.mode=v.mode;localStorage.setItem(UI_KEY,JSON.stringify(o))}catch(_){}};
  let cur=read();
  const mode=()=>cur.mode||(sys.matches?"dark":"light");
  function meta(){
    let m=document.querySelector('meta[name="theme-color"]');
    if(!m){m=document.createElement("meta");m.name="theme-color";document.head.append(m)}
    const bg=getComputedStyle(root).getPropertyValue("--bg").trim();if(bg)m.content=bg;
  }
  function apply(){root.dataset.pal=cur.pal;root.dataset.theme=mode();meta()}
  /* 顏色換好之後，正在跑的顏色過渡直接跳到結果（不然淡過去之後元件還在慢慢變色） */
  const COLOR_T=/color|background|border|box-shadow|fill|stroke|outline|all/;
  function settle(){void getComputedStyle(document.body||root).color;
    document.getAnimations().forEach(a=>{if(typeof CSSTransition!=="undefined"&&a instanceof CSSTransition&&COLOR_T.test(a.transitionProperty))a.finish()})}
  let vt=null;
  function change(){
    if(vt)vt.skipTransition();
    const go=()=>{apply();settle()};
    if(!document.startViewTransition||matchMedia("(prefers-reduced-motion: reduce)").matches||document.visibilityState!=="visible"){go();return}
    const t=vt=document.startViewTransition(go);
    t.ready.catch(()=>{});t.updateCallbackDone.catch(()=>{});   /* 途中被 skipTransition 時這兩個會 reject，不當成錯誤 */
    t.finished.catch(()=>{}).then(()=>{if(vt===t)vt=null});
  }
  /* 淡的途中點按：淡出立刻結束，那一下照樣算數。淡的途中瀏覽器把點按都送到 <html>（淡出層蓋在整頁上面），
     所以記下位置，等淡出收掉之後把這次點擊轉給那個位置底下的元素。
     按住拖走（位移超過 6px）不算點擊；放開後沒有接著來點擊（觸控常這樣）、取消、或點擊落在別的元素上，都把記下的位置丟掉 */
  let held=null;
  addEventListener("pointerdown",e=>{if(!vt)return;const t=vt;t.skipTransition();held=e.target===root?{x:e.clientX,y:e.clientY,t,id:e.pointerId}:null},true);
  addEventListener("pointerup",e=>{const h=held;if(!h||e.pointerId!==h.id)return;
    if(Math.hypot(e.clientX-h.x,e.clientY-h.y)>6){held=null;return}
    setTimeout(()=>{if(held===h)held=null},400)},true);
  addEventListener("pointercancel",e=>{if(held&&e.pointerId===held.id)held=null},true);
  addEventListener("click",e=>{if(!held)return;if(e.target!==root){held=null;return}const h=held;held=null;e.stopImmediatePropagation();e.preventDefault();
    h.t.finished.catch(()=>{}).then(()=>{const el=document.elementFromPoint(h.x,h.y);   /* 可能是 SVG 圖示（沒有 .click()）：送一個會冒泡的點擊，跟真的點一樣 */
      if(el&&el!==root&&el!==document.body)el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,clientX:h.x,clientY:h.y,view:window}))})},true);
  sys.addEventListener("change",()=>{if(!cur.mode)change();document.dispatchEvent(new CustomEvent("uichange"))});
  /* 別的分頁改了設定：跟著換 */
  addEventListener("storage",e=>{if(e.key!==UI_KEY&&e.key!==null)return;const n=read();if(n.pal===cur.pal&&n.mode===cur.mode&&n.sound===cur.sound)return;cur=n;change();document.dispatchEvent(new CustomEvent("uichange"))});
  apply();
  return {
    get:()=>({pal:cur.pal,mode:mode(),chosen:!!cur.mode,sound:cur.sound}),
    /* v：{pal}、{mode:"light"|"dark"}、{sound:true|false} 任意組合 */
    set(v){const n=clean({...cur,...v});if(n.pal===cur.pal&&n.mode===cur.mode&&n.sound===cur.sound)return;
      const was=root.dataset.pal+"|"+root.dataset.theme;cur=n;write(cur);
      if(was!==cur.pal+"|"+mode())change();else apply();   /* 看得到的顏色有變才淡過去（例如選了跟系統一樣的深淺色、只換音效就不用） */
      document.dispatchEvent(new CustomEvent("uichange"))},
    meta,
  };
})();
