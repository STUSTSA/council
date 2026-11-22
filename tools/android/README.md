# 安卓外殼（自用 APK）

用 Trusted Web Activity 把 https://stustsa.github.io/council/home.html 包成 App，走 Chrome，Google 登入可用。
不放進網站、網頁不載入；只由 `.github/workflows/build-android.yml` 在 GitHub 上建置。

- 取得 APK：GitHub repo → Actions → build-android-apk → 最新一次執行 → 最下方 Artifacts → council-apk。
- 簽章：沿用每次建置自動產生的 debug 簽章，金鑰不進 repo。因此每次新建的 APK 簽章都不同，更新前要先移除舊版 App。要固定簽章需另外設定 GitHub Secret（尚未做）。
- 預測返回手勢：AndroidManifest 啟用 `enableOnBackInvokedCallback`，保證返回桌面那段；頁內返回由 Chrome 處理。
- 網址列：assetlinks.json 必須放在網域根目錄（stustsa.github.io/.well-known/），子路徑做不到，所以 App 上方會有網址列。
