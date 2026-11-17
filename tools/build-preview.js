/* 產生 docs/預覽/03-即時回報.html：一個單一 HTML 檔，不用架伺服器、直接用瀏覽器打開，就能試改版階段 03 的即時回報原位編輯器。
   重建：在 repo 根目錄執行 node tools/build-preview.js（不需要安裝任何套件；改了 index.html、core/、dept/config.js 或測試資料後重跑一次）
   做法：
   - index.html 的 CSS（core/board.css、core/splash.css）與所有 script（core/js/*.js、dept/config.js）原樣內嵌，順序照 index.html；
     拿掉 Google Fonts、圖示、manifest 的連結與分享預覽的 meta，不載入任何外部資源（Firebase、GitHub API 也不會被呼叫）
   - 資料只用 tools/tests/data_test.json：拿掉雲端位置 sync、共用密碼雜湊（pwHash、pwKdf）等；成員只放一個沒有密碼的「預覽」身分；
     看板代號改成 preview-03（存檔寫進這個瀏覽器 localStorage 的 workboard:preview-03，不會碰到正式看板的暫存）
   - 部門設定：Firebase 網頁設定拿掉（firebase: null）、每個部門的資料來源都是 github、雲端位置空白 → 雲端關閉，存檔只寫 localStorage
   - 開頁就是登入狀態：內嵌一行預覽專用的 script，把目前身分設成「預覽」（正式網站沒有這一行）
   - 頁面上不加任何說明文字
   產生後會檢查：不能有 http(s):// 的資源載入（src／href／@import／url()）、不能出現權杖、密碼、Firebase 設定的字樣，不合格就不寫檔、以非 0 結束。 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "docs", "預覽", "03-即時回報.html");
const rd = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const fail = m => { console.error("沒有產生：" + m); process.exit(1); };

/* 資料：測試資料，拿掉雲端與密碼相關的欄位 */
const data = JSON.parse(rd("tools/tests/data_test.json"));
for (const k of ["sync", "pwHash", "pwKdf", "savedBy"]) delete data[k];
data.id = "preview-03";
data.locked = false;
data.members = [{ id: "mpv", name: "預覽", role: "admin", createdAt: data.savedAt || "" }];
const dataJSON = JSON.stringify(data).replace(/</g, "\\u003c");

/* 部門設定：拿掉 Firebase 設定、資料來源一律 github（設定檔本來就不放密碼或權杖） */
let cfg = rd("dept/config.js").replace(/firebase:\s*\{[^}]*\}/, "firebase: null").replace(/^[ \t]*\/\/[^\n]*(?:Firebase|firestore|QR)[^\n]*\n/gm, "");
if (/firebase:\s*\{/.test(cfg)) fail("dept/config.js 的 firebase 設定沒有拿掉");
cfg = cfg.replace(/source:\s*"[a-z]+"/g, 'source: "github"');

const html = rd("index.html");
const js = p => (p === "dept/config.js" ? cfg : rd(p)).replace(/<\/script/gi, "<\\/script");
const css = p => rd(p).replace(/<\/style/gi, "<\\/style");
let out = html
  .replace(/<link rel="(?:preconnect|icon|apple-touch-icon|manifest)"[^>]*>\n?/g, "")
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/g, "")
  .replace(/<meta (?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\n?/g, "")
  .replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, p) => `<style>\n${css(p)}\n</style>`)
  .replace(/<script id="state" type="application\/json">\{\}<\/script>/, () => `<script id="state" type="application/json">${dataJSON}</script>`)
  .replace(/<script src="([^"]+)"><\/script>/g, (_, p) => `<script>\n${js(p)}\n</script>` +
    (p === "core/js/team.js" ? '\n<script>/* 預覽專用：開頁就是「預覽」身分（正式網站沒有這一行） */meId="mpv";</script>' : ""));
out = out.replace("<title>", "<title>03 即時回報預覽｜");

/* 檢查 */
if (/<script src=|<link [^>]*href=/.test(out)) fail("還有外部的 script 或 link");
const ext = out.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+|@import\s+url\(\s*["']?https?:|url\(\s*["']?https?:\/\/[^)]+\)/gi);
if (ext) fail("還有外部資源：" + ext.slice(0, 3).join("、"));
for (const bad of [/AIza[0-9A-Za-z_-]{20,}/, /stustsa-council-dev/, /firebaseapp\.com/, /ghp_[0-9A-Za-z]{20,}/, /github_pat_/])
  if (bad.test(out)) fail("出現不該內嵌的字樣：" + bad);   /* 整份檔案：權杖、Firebase 設定 */
for (const bad of [/"sync"/, /"tokenEnc"/, /"tokenAll"/, /"pwHash"/, /"pwKdf"/, /"kdf"\s*:/, /"tok"\s*:/, /"owner"\s*:\s*"[^"]/, /apiKey/])
  if (bad.test(dataJSON) || bad.test(cfg)) fail("內嵌的資料或設定出現不該有的欄位：" + bad);   /* 程式碼本身會提到這些欄位名稱，只檢查資料與設定 */
if (!out.includes('"id":"preview-03"')) fail("資料沒有內嵌");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`已產生 ${path.relative(ROOT, OUT)}（${(out.length / 1024).toFixed(0)} KB，sha256 ${crypto.createHash("sha256").update(out).digest("hex").slice(0, 12)}）`);
