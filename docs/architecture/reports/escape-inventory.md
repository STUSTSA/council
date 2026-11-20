# 輸出跳脫盤點（基準 9a3896b；2026-11-19 的 04 更新：已修）

這份清單原本列出全站還沒統一跳脫的輸出位置。清單上需要處理的項目都已經修正，逐處的位置表不再保留。

| 類別 | 狀態 |
|---|---|
| 會長室追蹤面板、工作報告、會長室文件連結 | 已修（2026-11-16，測試 `tools/tests/xs1.js`） |
| 日期、時刻的輸出（進度、完成紀錄、每週概述、秘書處的各部門週報） | 已修（04，測試 `tools/tests/fd1.js`） |
| 搜尋結果的選擇器 | 已修（`CSS.escape`） |
| 值是常數或列舉、只是寫法不一致的地方 | 不影響輸出；之後改到那些檔案時順手統一 |

04 的做法（三層，各自獨立）：

1. **輸出**：日期、時刻放進 HTML 一律 `esc(fmt(...))`，跟其他來自資料的字串同一條規則（`core/js/util.js` 的 `esc`）。
2. **讀進畫面**：`core/js/store-map.js` 的 `tidy`——日期只收 `YYYY-MM-DD`、月份 `YYYY-MM`、時刻 `YYYY-MM-DD` 或 `YYYY-MM-DD[T 或空白]HH:MM[:SS]`，不合格式的換成空值；該是陣列、字串、數字的欄位型別不對就換成空的。`normalize`（資料檔、本機暫存、匯入備份）與 `toState`（Firestore 讀回來）都經過它；合格的值原樣不動，現有資料檔讀進來、存回去不變。
3. **規則**：`backend/firestore.rules` 對這些欄位加型別、格式與長度（[permissions.md](../permissions.md) 第 5.1i 節，測試 `backend/tests/rules-04.test.js`）。

之後新增輸出位置時：來自資料的值進 HTML 一律 `esc`、進 `style` 一律 `cssColor`／`cssNum`、網址一律 `safeUrl`；新的日期或時刻欄位加進 `tidy` 與規則。
