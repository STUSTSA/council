/* 離線用 Service Worker
   - 網頁、CSS、JS、圖示：網路優先（每次都先拿最新版，拿不到才用離線備份）→ 更新後重開就是新版
   - data.json、各部門的 data-*.json、archive/：一律走網路，不存進快取（離線時改由看板顯示這台裝置最後一次看過的內容）
   - GitHub API：不經過這裡 */
/* 快取版本：換大版本（改版 03 上線，2026-11-17 改 v2；新介面上線改 v3；ui-08 修正批改 v4；ui-09 改 v5；ui-10 改 v6；ui-11 改 v7；ui-12 改 v8；ui-13 改 v9；ui-14 改 v10；11-20 部長稱呼改 v12；設定浮上來時接住點擊改 v39）時改這個名字。sw.js 內容一變，瀏覽器下次開頁就會裝新的 Service Worker（skipWaiting＋clients.claim），
   activate 時刪掉自己舊名字（board-cache-*）的快取，離線備份不會留著舊版的 JS／CSS 跟新的網頁混用 */
const CACHE="board-cache-v112";
const NO_CACHE=/(^|\/)data(-[^/]*)?\.json$|\/archive\//;
/* 安裝時先收進離線備份的檔案：網頁本身、看板（index.html）載入的所有 CSS／JS、主頁另外用的 home.js 與九個部門標誌——
   App 打開的是主頁，只開過主頁就離線、再點部門時看板也畫得出來；第一次只打開看板就離線時，主頁也打得開。
   看板的清單要跟 index.html 的 <link>／<script> 同步（tools/tests/ui7.js 會檢查，漏加會被測出來）。
   其他檔案（圖示、manifest 等）由頁面送來的清單補（util.js 的 swReg：這一頁用到的檔、換手後再送一次）。
   一個一個收，單一個檔失敗不影響其他的 */
const SHELL=["./","index.html","home.html",
  "core/theme.css","core/board.css","core/splash.css",
  ...["theme","app","pagefx"].map(f=>`core/js/${f}.js`),"dept/config.js",
  ...["config","store-map","store","account","splash","shell","util","morph","anim","icons","state","cloud","render","views","dialog","save","weekly",
      "report","follow","notify","activity","drive","meeting","booking","attendance","proposals","back","motion","auth","team","provision","labels","nav","search","events","sfx","wallet","live","pwa","boot",
      "home"].map(f=>`core/js/${f}.js`),
  ...["president","secretariat","rights","marketing","finance","events","affairs","pr","works"].map(d=>`dept/icons/dept-${d}.svg`)];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,{cache:"no-cache"})).catch(()=>{})))).catch(()=>{}))});
self.addEventListener("activate",e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith("board-cache-")&&k!==CACHE)await caches.delete(k);   /* 只刪自己的舊版本：同一個網域（github.io）上其他 repo 的快取不動 */
  await self.clients.claim()})())});
self.addEventListener("message",e=>{
  const d=e.data||{};if(d.type!=="precache"||!Array.isArray(d.urls))return;
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(d.urls.filter(u=>!NO_CACHE.test(new URL(u).pathname)).map(u=>c.match(u).then(hit=>hit||c.add(new Request(u,{cache:"no-cache"}))).catch(()=>{})))));
});
/* 進部門提速（2026-11-21）：主頁點下部門的那一刻（過場動畫還在播），主頁送 {type:"warm"}，這裡就把看板的檔案（SHELL 裡 index.html 載入的那些）
   各向網路對一遍、存進備份並記下時間（warmAt）。接著看板換頁要這些檔時，15 秒內剛對過的直接用備份，不再多對一輪；超過 15 秒、或這個 Service Worker 被系統收掉重開
   （記憶體裡的時間沒了）就照舊網路優先。所以換頁後看到的還是「剛從網路確認過」的版本，更新照樣一兩分鐘內就生效。 */
const WARM_MS=15000,warmAt=new Map();
const BOARD_ONLY=u=>u!=="./"&&!/(^|\/)home(\.html|\.js)$/.test(u);   /* 看板要用的：不含主頁自己的檔 */
async function warmShell(){
  const c=await caches.open(CACHE);
  await Promise.all(SHELL.filter(BOARD_ONLY).map(async u=>{
    const url=new URL(u,self.registration.scope);const key=url.origin+url.pathname;
    try{const res=await fetch(url.href,{cache:"no-cache",credentials:"same-origin"});if(res.ok){await c.put(key,res.clone());warmAt.set(key,Date.now())}}catch(_){}
  }));
}
self.addEventListener("message",e=>{if((e.data||{}).type==="warm")e.waitUntil(warmShell())});
async function networkFirst(req,url){
  const c=await caches.open(CACHE);const key=url.origin+url.pathname;   /* 2026-11-06：網頁也照路徑各存一份（App 打開的是 home.html，不能拿到看板 index.html 的備份） */
  if(Date.now()-(warmAt.get(key)||0)<WARM_MS){const hit=await c.match(key);if(hit){warmAt.delete(key);return hit}}   /* 剛 warm 過：用一次就算數 */
  try{
    const res=await fetch(url.href,{cache:"no-cache",credentials:"same-origin"});
    if(res.ok){c.put(key,res.clone());warmAt.set(key,0)}
    return res;
  }catch(err){
    const hit=await c.match(key,{ignoreSearch:true});if(hit)return hit;
    throw err;
  }
}
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    if(NO_CACHE.test(url.pathname))return;              /* 資料：只走網路 */
    e.respondWith(networkFirst(req,url));
  }else if(/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.open(CACHE).then(c=>c.match(req).then(hit=>hit||fetch(req).then(res=>{c.put(req,res.clone());return res}))));
  }
});
