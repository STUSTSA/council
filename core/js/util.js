/* 核心｜共用小工具（日期、跳脫、toast） */
let BODY_SRC="";   /* 在 boot.js 擷取（扣除執行期產生的骨架）*/
const HOSTED=!!(window.claude&&window.claude.use);
let artifactNS=null,canWrite=!HOSTED;
const readOnly=()=>boardLocked()||(HOSTED&&!canWrite)||(isOffline()&&!editing);
const COLORS=["#6a4fd8","#3d7fe0","#a24fc0","#d84f92","#2f8f84","#c26a12","#6b6b75","#111114"];
const MARK_COLORS=["#8a6cf2","#6ea2f2","#b993f2","#f39ac8","#7fd0c8","#111114"];
const $=s=>document.querySelector(s);
/* 跳脫：所有來自資料的字串進 HTML（含屬性值，單、雙引號都跳脫）一律經過這一個函式 */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* 樣式值：所有來自資料、要放進 style="…"（或 style 屬性）的值一律經過這兩個函式，不各處自己處理。
   esc 擋不住「red;position:fixed;background:url(…)」這種用分號接新宣告的字串（03 審查 P1-1）。
   cssColor：只收 #rrggbb（程式內建的 COLORS、MARK_COLORS 都是這個格式），其他回預設色 d；cssNum：只收有限的數字，其他回 d */
const cssColor=(c,d=COLORS[0])=>typeof c==="string"&&/^#[0-9a-f]{6}$/i.test(c)?c:d;
const cssNum=(n,d=0)=>{const v=typeof n==="number"?n:typeof n==="string"&&n.trim()?Number(n):NaN;return Number.isFinite(v)?v:d};
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const ym=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const pd=s=>{const [y,m,d]=String(s).split("-").map(Number);return new Date(y,(m||1)-1,d||1)};
const today=()=>ymd(new Date());
const addDays=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return ymd(d)};
const nowStr=()=>{const d=new Date();return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
const fmt=s=>s?String(s).slice(0,10).replaceAll("-","/"):"";
const safeUrl=u=>!u?"#":/^https?:\/\//i.test(u)?u:"https://"+u;
const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,v));
/* 關掉動態（prefers-reduced-motion）時直接跳到結果 */
const reduceMotion=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),2000)};
const hasDates=i=>!!(i.start&&i.end);
/* 時程：議題設定的期間（開始日～結束日）到某天為止已經過了幾 %；沒有日期＝null（未排程） */
const issueSpan=i=>{if(!hasDates(i))return null;let s=i.start,e=i.end;if(e<s)[s,e]=[e,s];return [s,e]};
function schedPct(i,d=today()){const sp=issueSpan(i);if(!sp)return null;const a=pd(sp[0]),b=pd(sp[1]);return b<=a?(pd(d)>=a?100:0):Math.round(clamp((pd(d)-a)/(b-a)*100))}
function dateAtPct(i,p){const sp=issueSpan(i);if(!sp)return "";const a=pd(sp[0]),b=pd(sp[1]);return ymd(new Date(a.getTime()+(b-a)*clamp(p)/100))}
/* 註記在時程條上的位置：有日期的議題照註記日期放，沒日期的照舊用 at（%） */
const mkAt=(i,m)=>hasDates(i)&&m.date?schedPct(i,m.date):m.at;
const schedLabel=i=>{const p=schedPct(i);return p==null?"未排程":`時程 ${p}%`};
/* 毛玻璃材質 .glass（對話框、底部工具列、搜尋欄、分段切換） */
function glassify(el){if(el)el.classList.add("glass")}

/* Service Worker（sw.js）：只在正式網址（https／localhost）且頁面有 manifest 時註冊。看板（pwa.js）與主頁（home.js）共用。
   sw.js 是網路優先＋執行期快取：第一次打開時 Service Worker 還沒接手，這一頁已經載入的檔案不會自己進離線備份，
   所以註冊好了把這一頁用到的同站檔案（這一頁本身、載入紀錄、圖示、manifest，加上 extra：之後才會讀的檔，例如主頁的部門標誌）交給它收進去（precache 訊息）。
   新版 sw.js 換手時（快取版本換新、舊的快取被刪）再送一次給新的，不然上線後第一次打開送出的清單會跟著舊快取一起被刪（release-03，main 的 pwa.js／home.html 搬到這裡） */
function swReg(extra){
  if(!("serviceWorker" in navigator)||!document.querySelector('link[rel="manifest"]')||!(location.protocol==="https:"||/^(localhost|127\.0\.0\.1)$/.test(location.hostname)))return;
  const same=u=>{try{return new URL(u,location.href).origin===location.origin}catch(_){return false}};
  const send=w=>{if(!w)return;
    const urls=[new URL("./",location.href).href,location.href,...performance.getEntriesByType("resource").map(e=>e.name),
      ...[...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="manifest"]')].map(l=>l.href),...(extra||[]).map(u=>new URL(u,location.href).href)]
      .filter(same).map(u=>u.split("#")[0].split("?")[0]);
    w.postMessage({type:"precache",urls:[...new Set(urls)]})};
  const go=()=>{
    navigator.serviceWorker.register("sw.js").then(()=>navigator.serviceWorker.ready).then(reg=>send(reg.active)).catch(()=>{});
    navigator.serviceWorker.addEventListener("controllerchange",()=>send(navigator.serviceWorker.controller));
  };
  if(document.readyState==="complete")go();else addEventListener("load",go,{once:true});
}
