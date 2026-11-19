/* 核心｜可安裝（PWA）、離線唯讀 */
let netFail=false;   /* 讀 data.json 或 GitHub 時連不上 */
const isOffline=()=>!navigator.onLine||netFail;
function offlinePill(){
  let op=document.getElementById("offlinePill");
  if(!op){const si=document.getElementById("saveInfo");if(!si)return;op=document.createElement("span");op.id="offlinePill";op.className="offline-pill";op.setAttribute("role","status");op.innerHTML='<span class="live-dot" aria-hidden="true"></span>離線中';si.before(op)}
  op.hidden=!isOffline();
}
window.addEventListener("offline",()=>{if(!editing)render();else offlinePill()});
window.addEventListener("online",async()=>{netFail=false;if(cloudOn()){const r=await cloudPull({force:true});if(r==="updated")toast("已重新連線，看板已更新")}if(!editing)render();else offlinePill()});

/* ---------- 安裝成 App（03 F4，設定 →「這台裝置」）----------
   瀏覽器支援安裝（Android Chrome、電腦的 Chrome／Edge：beforeinstallprompt）時記下事件，「這台裝置」頁顯示一顆「安裝」；
   已經是安裝後的 App 打開的、或瀏覽器不支援時不顯示。iPhone／iPad 的 Safari（沒有安裝事件）尚未加入主畫面時，改顯示加入主畫面的步驟。 */
let pwaPrompt=null;
/* 已安裝＝從主畫面／App 打開（manifest 是 fullscreen，所以三種顯示模式都算；iOS 看 navigator.standalone） */
const pwaStandalone=()=>{try{return matchMedia("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)").matches||navigator.standalone===true}catch(_){return false}};
/* iPhone／iPad 的 Safari：IS_IOS（nav.js）、不是 App 內建瀏覽器（inAppBrowser，account.js）、不是其他瀏覽器（iOS 的 Chrome／Firefox／Edge…） */
const pwaIosSafari=()=>IS_IOS&&!inAppBrowser()&&/Safari\//.test(navigator.userAgent)&&!/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|YaBrowser|DuckDuckGo/.test(navigator.userAgent);
const pwaCanInstall=()=>!!pwaPrompt&&!pwaStandalone();
const pwaIosSteps=()=>!pwaPrompt&&!pwaStandalone()&&pwaIosSafari();
addEventListener("beforeinstallprompt",e=>{e.preventDefault();pwaPrompt=e;if(typeof renderSettings==="function")renderSettings()});
addEventListener("appinstalled",()=>{pwaPrompt=null;if(typeof renderSettings==="function")renderSettings()});
/* 安裝視窗只能叫一次：不論接受或取消都把事件清掉（取消後要等瀏覽器下次再給；03 審查 P1-1） */
async function pwaInstall(){
  const e=pwaPrompt;if(!e)return;pwaPrompt=null;
  try{await e.prompt();const r=await e.userChoice;if(r&&r.outcome==="accepted")toast("已安裝")}catch(_){}
  if(typeof renderSettings==="function")renderSettings();
}
const PWA_IOS_STEPS=["點「分享」","選「加入主畫面」","按「新增」"];
/* 這台裝置的「忘記這台裝置」只在舊的身分登入（GitHub 模式的看板）才有；用 Google 登入的看板（新資料庫、凍結中）沒有 */
const devForget=()=>!(storeSource()==="firestore"||(storeSource()==="frozen"&&FB_ON));
const devShow=()=>pwaCanInstall()||pwaIosSteps();

swReg();   /* Service Worker 與離線備份（util.js，主頁也用同一個） */

