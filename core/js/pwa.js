/* 核心｜可安裝（PWA）、離線唯讀、分享預覽文字 */
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

/* ---------- 分享預覽文字：改 index.html 的 meta（透過 GitHub API，用這台裝置的權杖） ---------- */
const metaGet=k=>document.querySelector(`meta[property="${k}"],meta[name="${k}"]`)?.getAttribute("content")||"";
function metaSet(html,k,v){
  const attr=k.startsWith("og:")?"property":"name",val=esc(v);
  const re=new RegExp(`<meta ${attr}="${k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}" content="[^"]*">`);
  const tag=`<meta ${attr}="${k}" content="${val}">`;
  return re.test(html)?html.replace(re,()=>tag):html.replace("</head>",()=>tag+"\n</head>");
}
async function shareSettings(){
  const v=await ask("分享預覽（貼連結到 LINE、IG、FB 時顯示）",[
    {name:"t",label:"標題",value:metaGet("og:title")||state.title},
    {name:"d",label:"說明文字",value:metaGet("og:description")}],{wide:true});
  if(!v)return;
  const t=(v.t||"").trim(),d=(v.d||"").trim();
  if(!t){toast("標題不能空白");return}
  if(!cloudOn()||!ghToken()){toast("要先在「雲端設定」連上 GitHub 才能更新預覽");return}
  const c=cloudCfg(),pc={...c,path:CFG.data.page||"index.html"},h={Accept:"application/vnd.github+json",Authorization:"Bearer "+ghToken()};
  toast("更新中…");
  let r;try{r=await fetch(apiURL(pc)+"?ref="+encodeURIComponent(c.branch)+"&t="+Date.now(),{headers:h,cache:"no-store"})}catch(_){toast("連不上 GitHub，沒有更新");return}
  if(!r.ok){toast(r.status===404?`在 repo 裡找不到 ${pc.path}`:"讀取網頁檔失敗（"+r.status+"）");return}
  const j=await r.json();let html=b64dec(j.content);
  const base=location.protocol==="https:"?new URL("./",location.href).href:"";
  const pairs=[["description",d],["og:title",t],["og:description",d],["twitter:title",t],["twitter:description",d]];
  if(base)pairs.push(["og:url",base],["og:image",base+"dept/cover.png"],["twitter:image",base+"dept/cover.png"]);
  pairs.forEach(([k,val])=>{html=metaSet(html,k,val)});
  let w;try{w=await fetch(apiURL(pc),{method:"PUT",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({message:`更新分享預覽文字 ${nowStr()}`,content:b64enc(html),sha:j.sha,branch:c.branch})})}catch(_){toast("連不上 GitHub，沒有更新");return}
  if(!w.ok){toast(w.status===409||w.status===422?"網頁檔剛好被別人改過，請再試一次":w.status===401?"GitHub 權杖無效或過期":"更新失敗（"+w.status+"）");return}
  pairs.forEach(([k,val])=>{const m=document.querySelector(`meta[property="${k}"],meta[name="${k}"]`);if(m)m.setAttribute("content",val)});
  toast("已更新預覽文字（約 1 分鐘後生效；LINE、FB 會快取舊預覽一段時間）");
}
