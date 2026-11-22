/* 核心｜共用小工具（日期、跳脫、toast） */
let BODY_SRC="";   /* 在 boot.js 擷取（扣除執行期產生的骨架）*/
const HOSTED=!!(window.claude&&window.claude.use);
let artifactNS=null,canWrite=!HOSTED;
const readOnly=()=>boardLocked()||(HOSTED&&!canWrite)||(isOffline()&&!editing);
/* 「報告」標記每週三（台灣時間 00:00）自動失效：標記當下記 ev.reportAt（"YYYY-MM-DD HH:mm"，台灣時間）；畫面只認本週三 00:00 之後的標記。
   舊標記沒有 reportAt 一律當作有效（上線當天不會全部消失）。過期的標記在有權限的人下次儲存時寫回 false（store-map.js desired），沒有權限的人只是看不到 */
const taipeiStr=ms=>{const t=new Date(ms+8*3600000),p=n=>String(n).padStart(2,"0");return `${t.getUTCFullYear()}-${p(t.getUTCMonth()+1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`};
const nowTaipei=()=>taipeiStr(Date.now());
const reportWeekStart=(ms=Date.now())=>{const back=(new Date(ms+8*3600000).getUTCDay()+4)%7;return taipeiStr(ms-back*86400000).slice(0,10)+" 00:00"};
const reportOn=ev=>!!(ev&&ev.report)&&(!ev.reportAt||ev.reportAt>=reportWeekStart());
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
const pd=s=>{const [y,m,d]=String(s).slice(0,10).split("-").map(Number);return new Date(y,(m||1)-1,d||1)};
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

/* 螢幕鍵盤（手機瀏覽器、已安裝的 App）：Android Chrome 預設鍵盤只縮小「可見區」、不縮版面，固定在底部的東西（主頁下排的加入連結列）會被鍵盤蓋住。
   這裡用 visualViewport 量出鍵盤高度寫成 --kb（px，沒鍵盤＝0），固定在底部的元素把它加進 bottom（board.css 的 .hm-dock），隨鍵盤平順浮上來、收起時落回；
   輸入框得到焦點時若被鍵盤蓋住，捲到畫面中間（逐行編輯等在頁面中間的輸入也一樣）。縮放中（scale≠1）不算鍵盤。 */
(function kbTrack(){
  const vv=window.visualViewport;if(!vv)return;
  const root=document.documentElement;let kb=0,t=0;
  const editable=el=>el&&(el.isContentEditable||(el.matches&&el.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=range]),textarea")));
  const reveal=()=>{const a=document.activeElement;if(!editable(a)||kb<80)return;
    const r=a.getBoundingClientRect();if(r.bottom>vv.height-12||r.top<8)a.scrollIntoView({block:"center",behavior:"smooth"})};
  const upd=()=>{
    const h=Math.max(0,Math.round(root.clientHeight-vv.height-vv.offsetTop));
    const n=Math.abs(vv.scale-1)>.01||h<80?0:h;   /* 小於 80px 多半是網址列伸縮，不算鍵盤 */
    if(n===kb)return;kb=n;root.style.setProperty("--kb",n+"px");
    clearTimeout(t);t=setTimeout(reveal,120);
  };
  vv.addEventListener("resize",upd);vv.addEventListener("scroll",upd);
  addEventListener("focusin",()=>{clearTimeout(t);t=setTimeout(reveal,320)});   /* 鍵盤還在升起：等它到位再看有沒有被蓋住 */
})();

/* 固定頂部區（.dtop）佔的高度（shell.js 量好寫進 --dtop-h）：捲動到某個元素時，要讓出這段 */
function dtopH(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dtop-h"))||0}
