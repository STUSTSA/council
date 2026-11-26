# 安卓外殼（自用 APK）

App 自己的畫面（WebView）滿版顯示 https://stustsa.github.io/council/home.html ，沒有網址列；上方狀態列、下方導覽列的顏色跟著網頁的 `meta theme-color`（網頁換主題、淺深色時一起變）。
不放進網站、網頁不載入；只由 `.github/workflows/build-android.yml` 在 GitHub 上建置。

- 取得 APK：https://github.com/STUSTSA/council/releases/download/apk-latest/council.apk （main 每次建置覆蓋）；也可到 Actions 該次執行下載 council-apk。
- 簽章：沿用每次建置自動產生的 debug 簽章，金鑰不進 repo。每次建置簽章不同，更新前要先移除舊版。要固定簽章需另外設定 GitHub Secret（尚未做）。
- 只載入 `https://stustsa.github.io/council/`；其他網址一律交給 Chrome。
- 網站連結用 App 開：manifest 宣告了 `https://stustsa.github.io/council`（`/council/`、`home.html`、`index.html`，含後面的 `?d=` 等參數）。沒有做網域驗證，所以裝好後要自己開一次：設定 → 應用程式 → 學生會看板 → 預設開啟 → 新增連結 → 勾 `stustsa.github.io`（Android 12 以上；每台手機、每次重裝都要勾）。之後在 LINE、訊息等 App 點到網站網址會用 App 開；在 Chrome 裡自己輸入網址或點 Chrome 內的連結仍留在 Chrome（Android 的行為）。`app-login.html` 故意不宣告（登入要在 Chrome 進行）。
  要做到「裝好就自動通過驗證」還缺兩件，都不在這個 repo 能做的範圍：固定簽章（GitHub Secret），以及把 `assetlinks.json` 放到 `https://stustsa.github.io/.well-known/`（要另一個 repo `STUSTSA/stustsa.github.io`）。
- 開機畫面（Android 12+ 系統畫面）：只有底色（`app_bg`，淺色米白、深色黑），圖示用全透明的 `splash_empty`，不顯示 logo；底色跟網頁開場動畫（`core/js/splash.js`）的底色一致，接著由網頁播 logo 進場動畫。
- 預測返回手勢（Android 13+）：網頁能往回時由 App 接手返回，在最上層時交給系統，才會有返回桌面的預測動畫。縮放約 0.80、位移 40dp、圓角 32dp（`BackHelper.java` 頂端常數可調）。
- 圖示：自適應圖示（白底＋標誌，標誌約佔 33%，在安全區內），另有 `ic_launcher_mono` 單色層給 Android 13+ 主題圖示（黃藍兩隻中間留一條等寬的縫（沿著前面那隻的輪廓往外推出來的，不是手畫）、眼睛挖空）。
- Google 登入：Google 不讓內嵌畫面登入。網頁偵測到 `window.CouncilApp` 時（`core/js/fb-account.js` 的 `signIn`）呼叫 `CouncilApp.login()` →
  App 產生一次性 nonce、開 Chrome 的 `app-login.html#n=nonce` → 登入後按「回到看板」→ 以指定本 App 套件名的 intent 帶回 Google ID 憑證與 nonce →
  App 驗 nonce（一次性、10 分鐘內）與憑證格式，才呼叫網頁的 `__councilAppSignIn` 用 `signInWithCredential` 登入。Chrome 那頁若原本沒登入，登入後立刻登出；原本就登入著則不動。nonce 存在 App 私有的 SharedPreferences（撐得過程序重啟），只有 VIEW＋councilapp://auth 的 intent 才會讀取並作廢。
- 限制：App 內「下載」只支援一般網址（匯出全部資料這類 blob 下載未處理）；沒測過鏡頭／QR 掃描。
