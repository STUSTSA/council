# 全站還沒統一跳脫的輸出位置（只列不改；基準 9a3896b）
共 41 處：高 3、中 21、低 17。共同根因：state.js normalize 不檢查日期欄位格式，fmt()/slice() 會輸出原始字元。
## 高（main 上現行網站也一樣）
1. core/js/follow.js:39 fwBody（會長室追蹤）：`fmt(mk.date).slice(5)` 沒 esc，後面直接接 esc(mk.text)。5 字剛好塞 `<img `，下一筆的文字變成屬性 → onerror 可執行（parse5 模擬確認，未在瀏覽器實跑）。觸發：任何人打開 ?d=president，不用登入、不用點。寫入門檻：直接改被追蹤部門的資料檔（持有權杖即可）。
2. core/js/report.js:73 工作報告「相關即時回報」：`fmt(e.doneAt).slice(5)` 同樣手法，打開匯出工作報告就執行。
3. core/js/follow.js:92/99 會長室文件連結 docURL 接受任何 scheme（javascript:、data:），沒走 safeUrl；另 data-doc="${d.id}" 沒 esc。
## 中（只能注入 HTML／破壞版面，組不出可執行碼）
fmt()/dot()/x.time 沒包 esc：follow.js:33,38；meeting.js:166,167,192,195,205；notify.js:54,87,186,265（x.time）；report.js:59,69,71；views.js:25,59,79,85,128,134,177,414,417；search.js:44 選擇器沒有 CSS.escape（ID 含引號會拋錯）。
## 低（值是常數或列舉，寫法不一致）
account.js:209（ROLE_T 查不到輸出 undefined）、268/277/319/354；activity.js:81,86,99,112；dialog.js:5–12,40；events.js:82,182,307（選擇器）；labels.js:21,37,50,53,55；meeting.js:40；nav.js:104,336；notify.js 多處 style="--c:"；report.js:45,186–188；save.js:5（自寫 replace，對 JSON-in-script 正確）；shell.js:116,124,134；views.js:137,152,211,233,236,316,324,327,356,366,371；home.html:139 自帶一份 esc。
## 建議順序
1 先修三個高（esc(fmt(...))、docURL 改 safeUrl）→ 2 全站 fmt/dot/x.time 一律包 esc → 3 normalize 與 store-map 驗證日期 YYYY-MM-DD、時刻 HH:MM → 4 search.js CSS.escape → 5 低風險順手統一。
