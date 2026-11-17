/* 離線用 Service Worker
   - 網頁、CSS、JS、圖示：網路優先（每次都先拿最新版，拿不到才用離線備份）→ 更新後重開就是新版
   - data.json、archive/：一律走網路，不存進快取（離線時改由看板顯示最後一次看過的內容）
   - GitHub API：不經過這裡 */
/* 快取版本：換大版本（改版 03 上線，2026-11-17 改 v2）時改這個名字。sw.js 內容一變，瀏覽器下次開頁就會裝新的 Service Worker（skipWaiting＋clients.claim），
   activate 時刪掉舊名字的快取，離線備份不會留著舊版的 JS／CSS 跟新的網頁混用 */
const CACHE="board-cache-v2";
const NO_CACHE=/(^|\/)data\.json$|\/archive\//;
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["./","index.html","home.html"].map(u=>new Request(u,{cache:"no-cache"})))).catch(()=>{}))});
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
