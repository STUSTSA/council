/* 離線用 Service Worker
   - 網頁、CSS、JS、圖示：網路優先（每次都先拿最新版，拿不到才用離線備份）→ 更新後重開就是新版
   - data.json、各部門的 data-*.json、archive/：一律走網路，不存進快取（離線時改由看板顯示這台裝置最後一次看過的內容）
   - GitHub API：不經過這裡 */
/* 快取版本：換大版本（改版 03 上線，2026-11-17 改 v2；新介面上線改 v3）時改這個名字。sw.js 內容一變，瀏覽器下次開頁就會裝新的 Service Worker（skipWaiting＋clients.claim），
   activate 時刪掉舊名字的快取，離線備份不會留著舊版的 JS／CSS 跟新的網頁混用 */
const CACHE="board-cache-v3";
const NO_CACHE=/(^|\/)data(-[^/]*)?\.json$|\/archive\//;
/* 安裝時先收進離線備份的檔案：網頁本身，加上新介面新增、只有某一頁才載入的檔（例如主頁的 home.js 與九個部門標誌）——
   第一次只打開看板就離線時，主頁也打得開。其他檔案由頁面送來的清單補（util.js 的 swReg：這一頁用到的檔、換手後再送一次）。
   一個一個收，單一個檔失敗不影響其他的 */
const SHELL=["./","index.html","home.html",
  "core/theme.css","core/js/theme.js","core/js/live.js","core/js/morph.js","core/js/sfx.js","core/js/home.js",
  ...["president","secretariat","rights","marketing","finance","events","affairs","pr","works"].map(d=>`dept/icons/dept-${d}.svg`)];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,{cache:"no-cache"})).catch(()=>{})))).catch(()=>{}))});
self.addEventListener("activate",e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})())});
self.addEventListener("message",e=>{
  const d=e.data||{};if(d.type!=="precache"||!Array.isArray(d.urls))return;
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(d.urls.filter(u=>!NO_CACHE.test(new URL(u).pathname)).map(u=>c.match(u).then(hit=>hit||c.add(new Request(u,{cache:"no-cache"}))).catch(()=>{})))));
});
async function networkFirst(req,url){
  const c=await caches.open(CACHE);const key=url.origin+url.pathname;   /* 2026-11-06：網頁也照路徑各存一份（App 打開的是 home.html，不能拿到看板 index.html 的備份） */
  try{
    const res=await fetch(url.href,{cache:"no-cache",credentials:"same-origin"});
    if(res.ok)c.put(key,res.clone());
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
