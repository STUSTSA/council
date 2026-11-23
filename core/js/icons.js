/* 核心｜線條 icon（取代 emoji 符號）；滑鼠停在上面時循環播放，按一下從頭播一次 */
/* 2026-11-18 ui-08 D：每個圖示的幾何外框都移到 24×24 的正中間（誤差 0.1 單位以內），放進圓鈕才會視覺置中；新增圖示照這個規則畫 */
const ICONS={"prev": "<path class=\"i-chev\" d=\"M15 6 9 12l6 6\"/>", "next": "<path class=\"i-chev\" d=\"M9 6l6 6-6 6\"/>", "edit": "<g class=\"i-pen\"><path d=\"M14.8 4.6l4 4L8.6 18.8 4 19.4l.6-4.6z\"/><path d=\"M12.8 6.6l4 4\"/></g><path class=\"i-trace\" d=\"M13 19.4h7\"/>", "history": "<g class=\"i-arc\"><path d=\"M4.6 12a7.4 7.4 0 1 0 2.2-5.2\"/><path d=\"M4.4 4.6v3.6H8\"/></g><path class=\"i-hand\" d=\"M12 8.2V12l2.6 1.7\"/>", "cloud": "<path class=\"i-cloud\" d=\"M6.7 17.75h9.8a3.9 3.9 0 0 0 .5-7.8 5.4 5.4 0 0 0-10.5 1.2A3.3 3.3 0 0 0 6.7 17.75z\"/>", "check": "<path class=\"i-check\" d=\"M5 12.4l4.4 4.4L19 7.2\"/>", "close": "<path class=\"i-x\" d=\"M6.5 6.5l11 11M17.5 6.5l-11 11\"/>", "chat": "<path d=\"M5.4 6h13.2a1.8 1.8 0 0 1 1.8 1.8v7.4a1.8 1.8 0 0 1-1.8 1.8h-6.6l-4 3.2V17H5.4a1.8 1.8 0 0 1-1.8-1.8V7.8A1.8 1.8 0 0 1 5.4 6z\"/><path d=\"M8.4 11.5h.01M12 11.5h.01M15.6 11.5h.01\"/>", "home": "<path class=\"i-roof\" d=\"M4 11 12 4.5l8 6.5V18.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z\"/>", "theme": "<circle cx=\"12\" cy=\"12\" r=\"8.2\"/><path d=\"M12 3.8a8.2 8.2 0 0 1 0 16.4z\" fill=\"currentColor\"/>", "sliders": "<path d=\"M4 7.5h16M4 16.5h16\"/><circle class=\"i-k1\" cx=\"15\" cy=\"7.5\" r=\"2.4\"/><circle class=\"i-k2\" cx=\"9\" cy=\"16.5\" r=\"2.4\"/>", "live": "<circle class=\"i-dot\" cx=\"12\" cy=\"12\" r=\"1.9\"/><path class=\"i-w1\" d=\"M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8\"/><path class=\"i-w2\" d=\"M5.8 5.8a8.8 8.8 0 0 0 0 12.4M18.2 5.8a8.8 8.8 0 0 1 0 12.4\"/>", "progress": "<path class=\"i-b1\" d=\"M4.5 7h8\"/><path class=\"i-b2\" d=\"M4.5 12h15\"/><path class=\"i-b3\" d=\"M4.5 17h10.5\"/>", "done": "<circle cx=\"12\" cy=\"12\" r=\"8.4\"/><path class=\"i-check\" d=\"M8.4 12.3l2.5 2.5 4.9-5.1\"/>", "people": "<g class=\"i-h1\"><circle cx=\"9.05\" cy=\"8.25\" r=\"3.1\"/></g><path d=\"M3.45 18.85c.6-3.3 2.8-5.2 5.6-5.2s5 1.9 5.6 5.2\"/><g class=\"i-h2\"><circle cx=\"16.45\" cy=\"9.05\" r=\"2.5\"/></g><path d=\"M16.25 13.65c2.3.2 3.8 1.8 4.3 4.4\"/>", "calendar": "<rect x=\"4\" y=\"5.7\" width=\"16\" height=\"14.5\" rx=\"2.6\"/><path d=\"M4 10.2h16M8.5 3.8v3.6M15.5 3.8v3.6\"/><rect class=\"i-day\" x=\"10.4\" y=\"13.2\" width=\"3.2\" height=\"3.2\" rx=\".8\"/>", "cap": "<path class=\"i-capt\" d=\"M2.8 10.05 12 5.65l9.2 4.4L12 14.45z\"/><path d=\"M6.6 12.05v4.2c1.4 1.4 3.3 2.1 5.4 2.1s4-.7 5.4-2.1v-4.2\"/><path d=\"M20.6 10.45v4.6\"/>", "flag": "<path d=\"M6 20.6V3.6\"/><path class=\"i-flag\" d=\"M6 4.2c2-1.1 4-1.1 6 0s4 1.1 6 0v8.2c-2 1.1-4 1.1-6 0s-4-1.1-6 0\"/>", "share": "<path d=\"M8.5 10.65H7a2 2 0 0 0-2 2V18.15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5a2 2 0 0 0-2-2h-1.5\"/><g class=\"i-up\"><path d=\"M12 14.65V3.95\"/><path d=\"M8.6 7.25 12 3.85l3.4 3.4\"/></g>", "download": "<path d=\"M4.5 15.65v2.2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.2\"/><g class=\"i-down\"><path d=\"M12 4.15v10.4\"/><path d=\"M8.3 10.95 12 14.65l3.7-3.7\"/></g>", "upload": "<path d=\"M4.5 15.5v2.2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.2\"/><g class=\"i-up\"><path d=\"M12 14.5V4.1\"/><path d=\"M8.3 7.8 12 4.1l3.7 3.7\"/></g>", "doc": "<path d=\"M7 3.8h7l4.2 4.2V19a1.4 1.4 0 0 1-1.4 1.4H7A1.4 1.4 0 0 1 5.6 19V5.2A1.4 1.4 0 0 1 7 3.8z\"/><path d=\"M13.8 3.9v4.4h4.3\"/><path class=\"i-l1\" d=\"M8.6 12.4h6.8\"/><path class=\"i-l2\" d=\"M8.6 15.9h4.6\"/>", "both": "<circle cx=\"9.2\" cy=\"12\" r=\"5.6\"/><circle cx=\"14.8\" cy=\"12\" r=\"5.6\"/>", "device": "<g class=\"i-phone\"><rect x=\"6.6\" y=\"3\" width=\"10.8\" height=\"18\" rx=\"2.4\"/><path d=\"M10.6 17.9h2.8\"/></g>"};
/* 2026-11-05：標籤、通知（鈴鐺擺動） */
ICONS.tag='<path d="M3.6 12.6V4.6a.8.8 0 0 1 .8-.8h8l7.6 7.6a1.2 1.2 0 0 1 0 1.7l-6.7 6.7a1.2 1.2 0 0 1-1.7 0z"/><circle class="i-dot" cx="8.1" cy="8.3" r="1.3"/>';
/* 2026-11-17 新介面：首頁鍵是簡單的五邊形房子（沒有門），整顆是 .i-roof，按下整顆往上跳 1.8px 再落回（board.css「線條 icon」的 icoRoof）；
   眼睛＝標題列的唯讀檢視鈕（沒有動作） */
/* 加號＝新增即時回報的浮動圓鈕（nav.js 的 fabSync），按下轉一下 */
ICONS.plus='<path class="i-plus" d="M12 5.5v13M5.5 12h13"/>';
/* 減號＝對話框數字上下按鈕的「減一」（加一用加號） */
ICONS.minus='<path d="M5.5 12h13"/>';
ICONS.eye='<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>';
ICONS.bell='<g class="i-bell"><path d="M6.2 15.05V9.65a5.8 5.8 0 0 1 11.6 0v5.4l1.6 1.8H4.6z"/><path d="M10.2 19.05a2 2 0 0 0 3.6 0"/></g>';
/* 2026-11-17 新介面：即時回報卡片（live.js）的返回、上一張／下一張（實心三角，下一張是左右翻過來）與底部工具列（文字、人、時間、地點、核取、超連結） */
ICONS.back='<path class="i-back" d="M19 12H5M11 6l-6 6 6 6"/>';
ICONS.tri='<path d="M17 5v14L7 12z" stroke="none" fill="currentColor"/>';
ICONS.text='<path d="M5.5 6h13M12 6v12"/>';
ICONS.user='<circle cx="12" cy="8.2" r="3.4"/><path d="M5.2 19.2c.7-3.4 3.4-5.2 6.8-5.2s6.1 1.8 6.8 5.2"/>';
ICONS.clock='<circle cx="12" cy="12" r="7.6"/><path d="M12 7.8V12l2.8 1.8"/>';
ICONS.pin='<path d="M12 20.1s6-5.3 6-10.2a6 6 0 0 0-12 0c0 4.9 6 10.2 6 10.2z"/><circle cx="12" cy="9.8" r="2"/>';
ICONS.box='<rect x="4.8" y="4.8" width="14.4" height="14.4" rx="4"/><path d="M8.6 12.3l2.4 2.4 4.4-4.9"/>';
/* 2026-11-17 新介面：行事曆月份鈕的往下箭頭 */
ICONS.down='<path d="M7 9.5l5 5 5-5"/>';
ICONS.link='<path d="M10.2 13.8a3.8 3.8 0 0 0 5.4 0l2.9-2.9a3.8 3.8 0 0 0-5.4-5.4l-1 1"/><path d="M13.8 10.2a3.8 3.8 0 0 0-5.4 0l-2.9 2.9a3.8 3.8 0 0 0 5.4 5.4l1-1"/>';
const ico=(n,mod="")=>`<svg class="ico ${mod}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[n]||""}</svg>`;
const icoHost=t=>t&&t.closest&&t.closest("button,a,.tab,.tb-gear");
function icoStart(h){if(!h||!h.querySelector(".ico"))return;clearTimeout(h._icoT);h.classList.add("ico-on")}
/* 停下來前先把正在跑的這一圈跑完 */
function icoStop(h){if(!h||!h.classList.contains("ico-on"))return;let wait=0;(h.getAnimations?h.getAnimations({subtree:true}):[]).filter(a=>/^ico/.test(a.animationName||"")).forEach(a=>{const t=a.effect&&a.effect.getComputedTiming?a.effect.getComputedTiming():null;if(!t||!(t.duration>0)||t.progress==null)return;wait=Math.max(wait,(1-t.progress)*t.duration)});clearTimeout(h._icoT);h._icoT=setTimeout(()=>h.classList.remove("ico-on"),wait)}
/* 按一下：從頭播一次、不循環，按下去馬上有回饋；播完如果滑鼠還停在上面就接著循環 */
function icoOnce(h){
  if(!h||!h.querySelector(".ico"))return;
  clearTimeout(h._icoT);const tok=h._icoTok=(h._icoTok||0)+1;
  h.classList.remove("ico-on","ico-once");void h.offsetWidth;h.classList.add("ico-on","ico-once");
  const as=(h.getAnimations?h.getAnimations({subtree:true}):[]).filter(a=>/^ico/.test(a.animationName||""));
  Promise.all(as.map(a=>a.finished.catch(()=>{}))).then(()=>{if(h._icoTok!==tok)return;h.classList.remove("ico-once");if(!h._hov)h.classList.remove("ico-on")});
}
document.addEventListener("pointerover",e=>{if(e.pointerType!=="mouse")return;const h=icoHost(e.target);if(h&&!h.contains(e.relatedTarget)){h._hov=true;if(!h.classList.contains("ico-once"))icoStart(h)}},{passive:true});
document.addEventListener("pointerout",e=>{if(e.pointerType!=="mouse")return;const h=icoHost(e.target);if(h&&!h.contains(e.relatedTarget)){h._hov=false;if(!h.classList.contains("ico-once"))icoStop(h)}},{passive:true});
document.addEventListener("pointerdown",e=>icoOnce(icoHost(e.target)),{passive:true});
