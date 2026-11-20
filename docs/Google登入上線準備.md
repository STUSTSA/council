# Google 登入上線準備（開發專案 `stustsa-council-dev`＋水果部實測；正式專案 `stustsa-council`）

> **2026-11-20 起網站設定是正式專案 `stustsa-council`**（換設定的 PR，第 4.8 節）。第 1～3 節是開發專案的部署與實測紀錄（步驟仍可照做，網址與 `--project` 換成要部署的專案）；第 4 節是正式專案，`<正式 ID>` 就是 `stustsa-council`。

- 寫於 2026-11-19，依據 `main` 的 `66a71ee`（規則與索引最後一次修改是 `e49bd5f`，2026-11-17）。
- 這份只是準備：**沒有部署、沒有登入任何主控台、沒有建專案、沒有改 `data*.json`**。下面每一步都由 DievE 用學生會公用帳號自己操作。
- 順序：第 1 節部署 → 合併水果部的 PR（第 3.0 節）→ 第 2 節建第一位總管理員 → 第 3 節實測 → 第 4 節正式專案（之後）。
- 主控台的按鈕名稱照繁體中文介面寫；Google 常改介面，找不到同名按鈕時看網址列對不對（每一步都附網址）。

---

## 1. 部署包（只部署到開發專案）

### 1.1 要部署的檔案

> 2026-11-19 之後規則有新版（04），見第 1.6 節；下表是第一次部署時的版本。

| 檔案 | 內容摘要 | 部署方式 | 部署後的效果 |
|---|---|---|---|
| `backend/firestore.rules`（830 行，SHA-256 `7f066e5e7023abdf6b93335bffeed89df84c146c340c88cf331becc93d850993`） | 預設拒絕。不用登入可讀：部門名稱（`departments`）、`org/config`、標成公開的活動。任何 Google 登入（信箱已驗證）可讀內部看板（卡片、議題、週報、標籤、時間標記、名稱）。秘書處點名與會議紀錄、會長私人行程另有限制。寫入照角色（部門編輯者、部門管理員、總管理員），角色每次寫入都重新讀 `roles/{UID}`（撤權立刻生效）。QR 邀請（10 分鐘、一次性）、權限申請、角色變更都要同一批寫稽核紀錄（版本號鏈），稽核紀錄任何人都不能改、刪。卡片永久刪除要同批寫刪除紀錄；議題、週報、標籤只有部門管理員以上能刪、同批寫刪除紀錄。卡片最多 50 行、一行 1000 字、10 個超連結。遷移匯入只有總管理員 | 主控台貼上（1.3） | 取代開發專案現在的規則。現在不帶身分讀 `departments` 會被拒絕，部署後可讀 |
| `backend/firestore.indexes.json`（SHA-256 `b06b2ac8b910b518e69d6a5798562f8267ecbd72b39404b73bf8b96636702369`） | 21 個複合索引（部門、時間事件、卡片、版本歷史〔集合群組〕、議題、週報、預約、申請、邀請、稽核紀錄、點名）＋14 個「這個欄位不建索引」的設定（卡片內容、版本內容、稽核紀錄的前後內容等大欄位，省空間） | Cloud Shell 指令（1.4；21 個索引用主控台一個一個建容易打錯） | 會長室管理的「申請」「紀錄」「權限歷史」、編輯紀錄、行事曆的查詢需要它們；沒部署時這些畫面顯示讀取失敗 |
| `backend/firebase.json` | 只告訴命令列規則與索引檔在哪（另外是模擬器設定，部署時不會用到） | 跟索引一起下載 | 不會上傳任何東西 |

**不部署**：Cloud Functions（沒有）、Hosting（網站在 GitHub Pages）、Storage（沒用到）。不需要升級方案，Spark 就夠。

### 1.2 部署前檢查（主控台，只看不改）

用學生會公用帳號登入，左上角確認專案名稱是 `stustsa-council-dev`（不是正式專案）。

| # | 打開 | 看什麼 | 算 OK |
|---|---|---|---|
| C-1 | https://console.firebase.google.com/project/stustsa-council-dev/authentication/providers | 「登入方式」清單 | Google 是「已啟用」；其他（電子郵件／密碼、匿名…）是停用（規則只認 Google，開了也進不來，但不需要開） |
| C-2 | https://console.firebase.google.com/project/stustsa-council-dev/authentication/settings →「授權網域」 | 網域清單 | 有 `stustsa.github.io`（還有預設的 `localhost`、`stustsa-council-dev.firebaseapp.com`、`stustsa-council-dev.web.app`）。若還有 `linkmasterking.github.io`，先不要動，記下來（待決定 5） |
| C-3 | https://console.firebase.google.com/project/stustsa-council-dev/firestore/databases/-default-/data | 有沒有資料庫 | 頁面上方寫 `(default)`，看得到資料（或空的「開始集合」）。如果要你「建立資料庫」＝開發專案還沒有 Firestore，停下來告訴我 |
| C-4 | https://console.cloud.google.com/auth/audience?project=stustsa-council-dev（Google Auth Platform →「目標對象」；舊介面叫「OAuth 同意畫面」） | 使用者類型、發布狀態 | 使用者類型「外部」＋發布狀態「實際運作中／正式版」。看到「內部」或「測試中」：不要改，截圖給決策端（`docs/architecture/verification.md` 第 9.2 節：會擋掉個人 Gmail 或沒列名的帳號） |
| C-5 | https://console.firebase.google.com/project/stustsa-council-dev/firestore/databases/-default-/rules | 現在的規則 | 全部選取、複製，存成一個文字檔（例如 `開發專案舊規則-20261119.txt`）。這是退回用的備份 |

### 1.3 部署規則（主控台網頁）

1. 打開 https://raw.githubusercontent.com/STUSTSA/council/66a71eee8f77d027a17959e36c3acb161f1369d9/backend/firestore.rules
   （網址裡固定了版本，之後 main 再改也不會變）。按 Ctrl+A（Mac：⌘A）全選、Ctrl+C 複製。
   - 確認第一行是 `rules_version = '2';`、最後一行是 `}`。
2. 打開 https://console.firebase.google.com/project/stustsa-council-dev/firestore/databases/-default-/rules
3. 點編輯區 → Ctrl+A 全選 → 貼上（整份取代，不要只貼一部分）。
4. 編輯區下方沒有紅色錯誤，左邊行號最後是 830 → 按「發布」。
5. **算成功**：上方出現「規則已發布」之類的提示；左側「規則歷史記錄」最上面多一筆剛剛的時間。
6. **驗證**（不用登入）：打開 https://firestore.googleapis.com/v1/projects/stustsa-council-dev/databases/(default)/documents/departments
   - 部署前：回應裡有 `"PERMISSION_DENIED"`。
   - 部署後：回應是 `{}`（還沒有部門文件，空的）或部門清單，**不是** `PERMISSION_DENIED`＝新規則生效。
   - 同一頁把結尾換成 `documents/cards`：仍然是 `PERMISSION_DENIED`（沒登入不能讀看板）＝也是對的。

**退回**：同一頁左側「規則歷史記錄」點上一版 →「還原」（或貼回 C-5 存的文字）→ 發布。只影響開發專案。

### 1.4 部署索引（Google Cloud Shell，一定要命令列的部分）

1. 打開 https://shell.cloud.google.com/?show=terminal （用學生會公用帳號；第一次會問是否同意條款，按同意）。等下面出現 `$` 提示字元。
2. 貼上下面這段，按 Enter（下載三個檔、印出雜湊）：
   ```bash
   C=66a71eee8f77d027a17959e36c3acb161f1369d9; mkdir -p ~/council-deploy && cd ~/council-deploy && for f in firebase.json firestore.rules firestore.indexes.json; do curl -fsSLO "https://raw.githubusercontent.com/STUSTSA/council/$C/backend/$f"; done; sha256sum firestore.rules firestore.indexes.json
   ```
   **算成功**：最後兩行開頭分別是 `7f066e5e7023…` 與 `b06b2ac8b910…`（跟 1.1 的表一樣）。不一樣就停下來。
3. 確認命令列認得這個帳號：
   ```bash
   npx -y firebase-tools@13.35.1 projects:list
   ```
   - 清單裡有 `stustsa-council-dev`＝可以往下。
   - 出現 `Failed to authenticate` 或「請先 login」：貼
     ```bash
     npx -y firebase-tools@13.35.1 login --no-localhost
     ```
     它會印一個網址 → 用滑鼠點開 → 選學生會公用帳號 → 允許 → 把畫面上的授權碼複製貼回 Cloud Shell → Enter。再跑一次 `projects:list`。
   - 問「Allow Firebase to collect CLI usage…?」：回答 `n`。
4. 部署索引（只有索引，不碰規則）：
   ```bash
   cd ~/council-deploy && npx -y firebase-tools@13.35.1 deploy --only firestore:indexes --project stustsa-council-dev
   ```
   - 如果問「…indexes are defined in your project but are not present in your firestore indexes file… delete these indexes?」：回答 `N`（不刪）。
   - **算成功**：最後幾行有 `deployed indexes in firestore.indexes.json successfully` 與 `Deploy complete!`。
5. 打開 https://console.firebase.google.com/project/stustsa-council-dev/firestore/databases/-default-/indexes
   - 「複合」分頁有 21 列，狀態從「建構中」變成「已啟用」（空的資料庫通常幾分鐘）。
   - 「單一欄位」分頁的「豁免項目」有 14 列。
6. 收尾（不要把登入留在 Cloud Shell）：
   ```bash
   npx -y firebase-tools@13.35.1 logout
   ```

**也可以在 Cloud Shell 一次部署規則和索引**（取代 1.3）：第 4 步改成 `--only firestore:rules,firestore:indexes`。兩種結果相同；先用主控台貼規則是因為你要求優先用網頁。

**失敗時截哪裡**：Cloud Shell 整個視窗（含指令與紅字）；主控台的錯誤提示。報錯裡不會有密碼或金鑰；如果畫面上出現授權碼，截圖前先把那一行遮掉。

### 1.5 2026-11-20 補一個索引（只重新部署索引，規則不變）

開發專案實測時「設定 → 編輯紀錄」讀取失敗（`failed-precondition`，缺索引）。新增集合群組 `versions` 的 `deptId ASC, at DESC`，共 22 個複合索引。前端每一個查詢與索引的對照在 `docs/architecture/indexes.md` 第 4 節。

| 檔案 | 這次 | SHA-256 |
|---|---|---|
| `backend/firestore.indexes.json` | 多一個索引 | `dbe4e2c39e01062430cb9c3ad969e0232a7f48267d48c72d06caa958825653b2` |
| `backend/firestore.rules` | **不變，不用重新部署** | `7f066e5e7023abdf6b93335bffeed89df84c146c340c88cf331becc93d850993`（跟 1.1 一樣） |

1. 打開 https://shell.cloud.google.com/?show=terminal （學生會公用帳號）。
2. 下載這一版的檔案（commit `1ba7680` 是補索引的那一個，PR 合併前後都可以用）：
   ```bash
   C=1ba7680fdab4412452f7064698d8a27f6af41cfb; mkdir -p ~/council-deploy && cd ~/council-deploy && for f in firebase.json firestore.rules firestore.indexes.json; do curl -fsSLO "https://raw.githubusercontent.com/STUSTSA/council/$C/backend/$f"; done; sha256sum firestore.rules firestore.indexes.json
   ```
   **算成功**：兩行開頭是 `7f066e5e7023…`（規則，跟上次一樣）與 `dbe4e2c39e01…`（索引，新的）。
3. 只部署索引：
   ```bash
   cd ~/council-deploy && npx -y firebase-tools@13.35.1 deploy --only firestore:indexes --project stustsa-council-dev
   ```
   要登入時照 1.4 第 3 步。問要不要刪掉檔案裡沒有的索引：回答 `N`。**算成功**：`Deploy complete!`。
4. https://console.firebase.google.com/project/stustsa-council-dev/firestore/databases/-default-/indexes 「複合」分頁有 22 列；新的一列是「versions｜集合群組｜deptId 遞增、at 遞減」，從「建構中」變成「已啟用」。
5. 驗證：水果部 → 設定 → 編輯紀錄，看得到 W-1、W-2 的紀錄（不再是「讀取失敗」）。如果還是失敗：F12 →「Console」會有一行紅字「Firestore 讀取失敗（編輯紀錄）」，截那一行給決策端（裡面有建索引的網址，**不要**照著網址自己建，回報就好）。
6. `npx -y firebase-tools@13.35.1 logout`。

---

### 1.6 2026-11-19 只重新部署規則（04：欄位的型別、格式與長度；索引不變）

規則多了欄位的型別、格式與長度檢查，權限申請改成每人每個部門一份（`docs/architecture/permissions.md` 第 5.1i 節、`invitations-roles-audit.md` 第 9.7 節）。2026-11-20 又加上舊身分（`legacyIdentities`）新建時的檢查（926 → 930 行）：**下表是最新的一版，部署一次就好**；如果已經部署過 `fc5b6746…` 那一版，照同樣的步驟再貼一次這一版。**只有規則要重新部署**，沒有新的索引、沒有新的集合、不需要遷移資料。

| 檔案 | 這次 | SHA-256 |
|---|---|---|
| `backend/firestore.rules`（930 行） | **要重新部署** | `32208b5240711af00f1cb91f1d07ae4cc4747a0d135882e3424c9bd4c02b18c7` |
| `backend/firestore.indexes.json` | 不變，不用重新部署 | `dbe4e2c39e01062430cb9c3ad969e0232a7f48267d48c72d06caa958825653b2`（跟 1.5 一樣） |

**順序**：先部署規則，緊接著合併這個 PR（網站）。現在線上的網頁寫出來的內容都符合新規則，所以規則先上不會讓存檔失敗；唯一的例外是「申請編輯權限」——還沒重新整理的舊網頁送不出申請（提示「沒有權限」），合併後重新整理就好。反過來（先合併、後部署）則是所有人在部署前都送不出申請，所以不建議。

步驟（主控台網頁，跟 1.3 同一套）：

1. 先備份現在的規則：打開 https://console.firebase.google.com/project/stustsa-council-dev/firestore/databases/-default-/rules ，全選、複製，存成文字檔（例如 `開發專案舊規則-04之前.txt`）。
2. 打開 https://raw.githubusercontent.com/STUSTSA/council/6f7eab5485748604f85b7b90d9663168f43fcb26/backend/firestore.rules （網址固定了版本，PR 合併前後都可以用）。Ctrl+A 全選、Ctrl+C 複製。
   - 確認第一行是 `rules_version = '2';`、最後一行是 `}`。
   - 想核對雜湊的話：把那一頁另存成檔案，在 Cloud Shell 或自己電腦執行 `sha256sum firestore.rules`，開頭要是 `32208b524071…`。
3. 回到規則頁 → 點編輯區 → Ctrl+A 全選 → 貼上（整份取代）。
4. 編輯區下方沒有紅色錯誤，左邊行號最後是 930 → 按「發布」。
5. **算成功**：出現「規則已發布」；左側「規則歷史記錄」最上面多一筆剛剛的時間。
6. 驗證（不用登入，跟 1.3 一樣）：
   - https://firestore.googleapis.com/v1/projects/stustsa-council-dev/databases/(default)/documents/departments 回部門清單或 `{}`，不是 `PERMISSION_DENIED`。
   - 結尾換成 `documents/cards`：`PERMISSION_DENIED`。
7. 合併 PR 之後，在水果部實測（電腦與手機各一次）：

| # | 做什麼 | 算成功 |
|---|---|---|
| H-1 | 打開一張有內容的即時回報，改一行字 → 點外面存 | 已儲存；重新整理後還在 |
| H-2 | 新增一張即時回報、加一個時間、加一個超連結 → 存；再把時間拿掉 → 存 | 兩次都已儲存 |
| H-3 | 進度頁：新增一個議題、設期間、加一筆處理紀錄 → 存 | 已儲存；甘特圖與議題詳情的日期照常顯示 |
| H-4 | 設定 → 每週概述 → 生成一份 → 存 | 已儲存；清單的日期照常顯示 |
| H-5 | 用一個沒有角色的帳號：設定 → 帳號 → 申請編輯權限（水果部、編輯者）→ 送出；再送一次同部門 | 第一次「已送出申請」；第二次在視窗裡提示「這個部門已經有一筆待審的申請」 |
| H-6 | 總管理員：會長室管理 → 申請 → 拒絕 H-5 那筆；申請人再申請一次 → 總管理員核准 | 再申請成功；核准後申請人變成編輯者；「紀錄」裡看得到送出、拒絕、送出、核准 |
| H-7 | 總管理員：設定 → 看板名稱改一個字 → 存，再改回來 | 兩次都已儲存 |
| H-9 | 總管理員：會長室管理 → 申請 → 核准一筆；人員 → 把一個編輯者改成管理員、再改回來 | 核准與改成管理員都先跳確認（寫出信箱）；按取消不會變；改回編輯者不用確認 |
| H-10 | 總管理員：會長室管理 → 匯入 → 水果部 → 兩格故意填錯（SHA-256 填 64 個 0）| 停在紅字「…沒有寫入」，沒有「確認匯入」的按鈕 |
| H-8 | W-1 的「上限測試」卡片（50 行、10 個超連結）：改一行字 → 存 | 已儲存。**失敗而且 Console 有 `maximum of 1000 expressions`**＝正式環境的運算量上限比模擬器小：照下面「退回」退回舊規則，把那一行紅字給決策端 |

**退回**：規則頁左側「規則歷史記錄」點上一版 →「還原」→ 發布（或貼回第 1 步存的文字）。退回舊規則之後，新網頁的「申請編輯權限」會送不出去（其他功能不受影響），所以退回規則時把 PR 也 revert。

---

## 2. 第一位總管理員與備援擁有者

### 2.0 順序

1. 第 1 節部署完成。
2. 合併水果部的 PR（第 3.0 節）。要先合併，因為只有 `source: "firestore"` 的部門有「用 Google 登入」。
3. 要當總管理員的人（建議 DievE 自己的 Google 帳號，不是公用帳號）打開 https://stustsa.github.io/council/index.html?d=fruit → 右下「設定」→「用 Google 登入」→ 選帳號。帳號頁會顯示名字、信箱、「唯讀」。
4. 下面 2.1 的兩份文件由公用帳號在主控台建立（主控台不經過規則，網站上任何人都做不到這件事）。

### 2.1 建文件

**找 UID**：https://console.firebase.google.com/project/stustsa-council-dev/authentication/users → 找到剛剛登入的信箱 →「使用者 UID」欄（滑過去有複製鈕）。28 個英數字，例如 `aB3dE…`。下面的 `UID` 都換成它。

**文件一：`roles/UID`**

打開 https://console.firebase.google.com/project/stustsa-council-dev/firestore/databases/-default-/data
→ 「開始集合」（已經有 `roles` 集合就點它再按「新增文件」）→ 集合 ID：`roles` → 文件 ID：貼上 UID（前後不要有空白）→ 欄位：

| 欄位名稱 | 類型 | 值 |
|---|---|---|
| `super` | boolean | `true` |
| `depts` | map | 不加任何子欄位（空的） |
| `rev` | number | `1` |
| `lastVia` | string | `manual` |
| `lastRef` | string | `bootstrap` |
| `updatedBy` | string | UID |
| `updatedAt` | timestamp | 今天、現在的時間 |

→ 儲存。

**文件二：`auditLogs/roles_UID_1`**（稽核紀錄的第一筆；文件 ID 是 `roles_`＋UID＋`_1`）

| 欄位名稱 | 類型 | 值 |
|---|---|---|
| `col` | string | `roles` |
| `docId` | string | UID |
| `rev` | number | `1` |
| `action` | string | `bootstrap` |
| `actor` | string | UID |
| `at` | timestamp | 現在的時間 |
| `before` | map | 空的 |
| `after` | map | 兩個子欄位：`super`（boolean `true`）、`depts`（map，空的） |
| `ref` | string | `console` |

欄位名稱全部小寫照抄（`docId`、`lastVia`、`lastRef`、`updatedBy`、`updatedAt` 中間的大寫字母照抄），不要多加欄位。主控台如果不讓 map 空著，`depts` 可以整個不加（規則把沒有當成空的），其他照填。

**算成功**：回到水果部看板 → 重新整理 → 設定 →「帳號」最上面多一個「總管理員」膠囊；設定清單多一列「會長室管理」→ 點「紀錄」看得到一筆「建立總管理員」。

### 2.2 做錯會怎樣、怎麼改回來

主控台可以直接改、刪這兩個集合（主控台不受規則限制），網站上的任何人都不行。

| 做錯 | 會怎樣 | 怎麼改回來 |
|---|---|---|
| 文件 ID 不是 UID（貼成信箱、多了空白、貼到別人的 UID 以外的字） | 網站上仍然是「唯讀」，沒有「會長室管理」 | 在主控台刪掉那份文件（右邊 ⋮ →「刪除文件」），用正確的 UID 重建。錯 ID 的 `auditLogs` 也刪掉重建 |
| `super` 選成 string 的 `"true"`，或欄位名打成 `Super` | 不是總管理員 | 主控台把那個欄位刪掉，重加成 boolean `true` |
| `rev` 選成 string，或多加了表格以外的欄位 | 現在看起來正常；但之後在網站上改**這個人**的角色會失敗（「沒有權限」），因為規則要求 `rev` 是數字、欄位只能是那七個 | 主控台把 `rev` 改成 number `1`、刪掉多的欄位 |
| `auditLogs` 那份漏建或內容打錯 | 權限不受影響；只有「權限歷史」少了第一筆或顯示怪怪的 | 主控台補建，或刪掉重建 |
| 建錯專案（建到正式專案） | 正式專案多一個總管理員 | 立刻在那個專案刪掉這兩份文件（正式專案還沒有人用，沒有別的影響） |
| 把總管理員給了**別人的真實 UID** | 那個人能改全部部門、發 QR、匯入 | 你自己的總管理員建好後，在網站「會長室管理 → 人員 → 點他 → 總管理員『取消』」（有稽核紀錄）。**不要**在主控台直接刪他的 `roles` 文件：他的 `auditLogs/roles_UID_1` 刪不掉（稽核紀錄只能新增），之後他再被邀請時第 1 版的紀錄會撞號，邀請永遠失敗。如果還沒有正確的總管理員，就在主控台只把他的 `super` 改成 `false` |

**之後不要再用主控台改 `roles`**：一般的授予、撤銷都在網站上做（同一批自動寫稽核紀錄、版本號 +1）。主控台只用在第一位總管理員與「全部總管理員都失聯」的救援（`docs/architecture/invitations-roles-audit.md` 第 7 節）。

### 2.3 備援擁有者（Firebase 專案的擁有者，不是網站上的角色）

決定 D9：專案只放公用帳號＋1 個備援帳號，兩個都要開兩步驟驗證。

1. 打開 https://console.firebase.google.com/project/stustsa-council-dev/settings/iam（專案設定 →「使用者和權限」）→「新增成員」。
2. 填備援帳號的信箱 → 角色選「擁有者」→「新增成員」。
3. 備援帳號會收到邀請信，要用那個帳號點信裡的連結接受（擁有者一定要接受邀請才生效）。
4. **算成功**：清單裡兩個帳號、角色都是「擁有者」，沒有其他人；備援帳號登入 https://console.firebase.google.com 看得到 `stustsa-council-dev`。
5. 兩個帳號各自到 https://myaccount.google.com/security 開「兩步驟驗證」。

做錯：信箱打錯 → 那一列右邊刪除、重加；角色選成「編輯者」「檢視者」→ 點那一列改成「擁有者」。不要移除公用帳號自己。加不進去、出現「不屬於允許的網域」之類的訊息＝專案在學校 Google 組織底下、組織限制外部帳號：截圖給決策端，不要改組織設定。

**網站上的備援總管理員**（建議，跟上面是兩件事）：請第二個人（例如會長室）在水果部登入一次 → 你在「會長室管理 → 人員 →＋授予權限」選他、部門選水果部、角色編輯者 → 點他 →「總管理員」按「授予」。這樣你的帳號出問題時不用動主控台。

---

## 3. 真實登入實測清單（正式網址＋水果部）

### 3.0 前提

- 第 1 節部署完成、索引「已啟用」。
- 水果部的 PR 已合併（只把水果部改成 `source: "firestore"`，指向正式專案 `stustsa-council`），等 1～2 分鐘。測試修正的 PR（分支 `tests-config-source`）排在它前面合併：不影響網站，只是不先合的話之後跑測試會失敗。行事曆修正（[STUSTSA/council#81](https://github.com/STUSTSA/council/pull/81)，測試部門不算進 `storeScopeOn`）也排在它前面。
- 第 2 節的總管理員已建立。
- 網址一律用 https://stustsa.github.io/council/index.html?d=fruit （水果部不在總覽裡，只能用網址進）。
- 準備：電腦（Chrome）、iPhone、Android 手機；三個 Google 帳號：A＝總管理員（你）、B＝一個沒有任何角色的帳號（個人 Gmail）、C＝學校帳號（R-02 用）。

每一項記下：裝置型號、系統版本（iOS 17.x、Android 14…）、瀏覽器、時間、結果（過／不過）、畫面文字。

**截圖的共同原則**：整個螢幕含網址列；提示訊息（畫面下方的小黑框）約 3 秒就消失，來不及就用錄影；電腦另外按 F12 →「Console」分頁截紅字。不要截「匯出全部資料」檔案的內容（有信箱）；任何時候都不要截 GitHub 權杖的畫面。

### 3.1 準備步驟（依序，只做一次）

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| S-1 匯入頁 | 電腦 Chrome、帳號 A：水果部 → 設定 → 會長室管理 →「匯入」→ 清單裡水果部標「新資料庫」→ 點它 → 跳出「匯入 水果部（已切到新資料庫）」→ 按「匯入」 | 依序顯示讀取、寫入、檢查；報告最上面是 `stustsa-council`，下一行 `data-fruit.json · STUSTSA/council · commit …`；表格每一列「相同」、V1～V4、V6「通過」（沒有 V5 是正常的，V5＝下一句的重跑）、最下面「結果：通過」「衝突 0」。再按「再匯入一次」：寫入 0、衝突 0、結果通過 | 整張報告（只有數量與代號，沒有機密）；失敗時的紅字 |
| S-2 匯入頁的權限 | 帳號 B（另一個瀏覽器或無痕視窗）登入水果部 → 設定 | 沒有「會長室管理」 | 設定清單 |

S-1 要排在任何看板寫入之前：水果部的資料檔是空的，先寫了卡片再匯入，報告的卡片數會「不同」（照遷移手冊，報告只在開放編輯前有意義）。

### 3.2 第一件事：50 行、10 個超連結的卡片（電腦 Chrome，帳號 A）

這是規則上限，正式環境的運算量上限只能在這裡驗（模擬器是 18／22 個固定索引，`verification.md` 第 11 節〔待驗證〕）。

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| W-1 建卡 | 即時回報 → 右下新增 → 名稱「上限測試」→ Enter 進內容 → 打「1」Enter「2」Enter …一直到「50」（50 行；第 51 次 Enter 不會再多一行，或出現上限提示）→ 工具列「超連結」加 10 個（名稱 L1～L10、網址 `https://example.com/1`～`/10`）→ 按第 11 次「超連結」出現「最多 10 個超連結」→ 點卡片外面（或 Esc）存檔 | 卡片上的儲存回饋是已儲存、沒有「儲存失敗」；重新整理後卡片還在、內容 50 行、10 顆超連結；卡片上的編輯次數小膠囊是 1 | 卡片下方的儲存回饋文字；F12 Console 紅字（有 `evaluation`、`limit`、`expression` 字樣請整段截，代表超過正式環境的運算上限） |
| W-2 改一行 | 同一張卡片把第 25 行改成「25 改」→ 存 | 已儲存；重新整理後還在；編輯次數 2；設定 → 編輯紀錄有這一筆 | 同上 |
| W-3 加時間 | 同一張卡片先刪掉最後一行（剩 49 行）→ 工具列「時間」加一個時間 → 存。時間本身佔一行（規格：每個時間是內容裡的一行），所以滿 50 行時按「時間」會提示「最多 50 行」，這是對的，不是錯誤 | 已儲存；重新整理後是 50 行（49 行文字＋1 行時間）、10 個超連結、編輯次數 3（規則的上限：50 行＋10 個超連結＋時間標記同一批寫入） | 同上 |

### 3.3 登入（每種環境都做；帳號 B，除非另外寫）

| # | 環境 | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|---|
| L-1 | 電腦 Chrome | 水果部 → 設定 →「用 Google 登入」→ 選帳號 | 跳出一個小視窗，選完自動關；設定 → 帳號顯示名字、信箱、「唯讀」；看板看得到「上限測試」卡片 | 登入後的帳號頁；Console 紅字；畫面上的「登入失敗（…）」整句 |
| L-2 | 電腦 Chrome，彈出視窗被擋 | 網址列左邊的網站資訊圖示 →「網站設定」→「彈出式視窗與重新導向」改「封鎖」→ 回看板登出 → 再「用 Google 登入」 | 整頁跳到 Google → 選帳號 → 回到水果部，已登入。**可能不過**（見待決定 1）：回來後仍是未登入 | 回來後的整個畫面含網址列；Console 紅字。測完把設定改回「允許」 |
| L-3 | iPhone Safari | 同 L-1。先在「設定 → App → Safari →『阻擋彈出式視窗』」開著（預設）測一次，再關掉測一次 | 登入後回到水果部、帳號頁顯示名字。開著阻擋時可能改成整頁跳轉，跳回來仍未登入＝記下來（待決定 1） | 回來後的整頁（含網址列）；Safari 版本（設定 → 一般 → 關於本機 → iOS 版本） |
| L-4 | iPhone，安裝成 App | Safari 打開水果部 → 分享 →「加入主畫面」→ 從主畫面打開 → 若直接是水果部：設定 → 登入；關掉 App 再打開 | 能登入；關掉再打開仍是登入。**若打開的是總覽（主頁）、進不了水果部**：這項記「無法進入」，不要硬試（App 從主頁開始，水果部不在總覽；見待決定 2）。若登入視窗開在另一個 Safari 畫面、回來仍未登入，也記下來 | 從主畫面打開後的第一個畫面；登入後的帳號頁 |
| L-5 | Android Chrome | 同 L-1 | 同 L-1 | 同 L-1（Chrome 右上 ⋮ → 設定 → 關於 Chrome 看版本） |
| L-6 | Android，安裝成 App | Chrome 打開水果部 → 設定 →「這台裝置」→ 安裝 → 從主畫面打開（會是總覽）→ 把水果部網址貼到 Google Keep 或簡訊、點連結 | 連結在 App 裡打開水果部（不是 Chrome 分頁）→ 登入 → 關掉 App 再打開仍是登入。在 Chrome 分頁打開＝記下來（待決定 2） | 點連結後打開的畫面（App 沒有網址列＝在 App 裡） |
| L-7 | LINE 內建瀏覽器 | 把水果部網址貼到任何 LINE 聊天室（例如只有自己的群組）→ 點開 → 設定 | 顯示「用瀏覽器開啟」與「複製網址」，**不會**跳 Google 登入；按「複製網址」→ 貼到 Safari／Chrome 打得開水果部 | 設定畫面；提示文字 |
| L-8 | 學校帳號（電腦 Chrome） | 用帳號 C 做 L-1 | 能登入（D1：任何 Google 帳號）。出現「存取遭封鎖：…管理員政策」＝學校限制，記下整句（`verification.md` 第 9.2 節第 3 點） | 被擋的整頁 |

### 3.4 手機上編輯同一張卡片（L-3、L-5 之後；帳號 A 在手機登入）

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| W-4 | iPhone Safari 與 Android Chrome 各一次：打開「上限測試」→ 改第 10 行 → 點外面存 | 已儲存；電腦重新整理看到改過的那一行 | 卡片的儲存回饋；畫面 |

### 3.5 QR 邀請（電腦產生、手機加入）

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| Q-1 | 電腦 A：會長室管理 →「QR 邀請」→ 部門「水果部」、角色「編輯者」→ 產生。Android（帳號 B，已登入或還沒登入都可以）用**相機**掃 → 打開 → 登入 →「加入」。從 QR 出現開始計時 | 提示「已加入水果部（編輯者）」；網址列沒有 `#join=`；電腦「人員」看得到 B 是「水果部・編輯者」；B 改「上限測試」的一行能存；總共花幾分鐘（記下來，10 分鐘有效期是否夠） | 手機加入後的畫面（含網址列）；失敗的提示整句；電腦的 QR 面板（有倒數） |
| Q-2 | 同一張 QR 用 iPhone 再掃一次 | 「這張邀請已失效」 | 提示 |
| Q-3 | 產生新 QR → 用 **LINE** 掃 | 跟 L-7 一樣出現「用瀏覽器開啟」「複製網址」；複製的網址含 `#join=`，貼到 Safari 打開後接著走加入流程（用帳號 C 加入，順便測學校帳號） | LINE 裡的畫面；貼到瀏覽器後的畫面 |
| Q-4（可選） | 產生新 QR，兩支手機同時掃、同時按「加入」 | 只有一支成功，另一支「這張邀請已失效」 | 兩支手機的畫面 |
| Q-5 | 產生 QR 後按「重新產生」→ 掃舊的那張 | 舊的失效、新的能用 | 提示 |

### 3.6 撤權（Q-1 之後）

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| R-1 | B 的手機開著水果部、**不要重新整理**。電腦 A：人員 → 點 B → 水果部那一列「撤銷」→ 確認 | 幾秒內 B 的帳號頁變「唯讀」；B 再改卡片存不進去（「沒有權限，沒有儲存」或已經沒有編輯入口）；B 重新整理後仍看得到看板（D1：撤權只收回寫入） | B 撤銷後試著存的畫面；B 的帳號頁 |
| R-2 | 電腦 A：人員 → 點 B →「權限歷史」 | 依序有「QR 加入」（+水果部編輯者）「撤權」（−水果部）兩筆 | 權限歷史 |

### 3.7 刪除卡片與議題（含稽核紀錄；電腦 A）

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| D-1 卡片（有 4 個以上時間） | 新增卡片「刪除測試」，加 4 個時間 → 存。把這顆卡片（即時回報的膠囊）拖到左上角 → 確認「刪除『刪除測試』？」→ 再確認「一起刪掉 4 個時間標記？」 | 卡片消失、重新整理後不會回來；會長室管理 →「紀錄」最上面有一筆刪除卡片（標題「刪除測試」）；沒有任何「儲存失敗」（這一步會分好幾批，測正式環境每批 20 次讀取的上限） | 失敗的提示；F12 Console（`evaluation`、`limit` 字樣） |
| D-2 議題 | 進度（甘特圖）→「+ 議題」→ 名稱打「議題刪除測試」→ Enter 存 → 在它的詳情按「刪除」→ 確認「刪除議題」 | 議題消失、重新整理後不會回來；「紀錄」有一筆「刪除議題」（議題「議題刪除測試」）。Q-1 之後、R-1 之前可以順便看：編輯者 B 的畫面上沒有議題的「刪除」鈕（只有部門管理員以上有） | 同上 |
| D-3 主控台對照（可選） | https://console.firebase.google.com/project/stustsa-council/firestore/databases/-default-/data → `auditLogs` | 有 `cards_fruit__…_purge_…` 與 `issues_fruit__…_delete_…` 兩份；`cards` 裡沒有「刪除測試」 | 文件清單（只截 ID 那一欄） |

### 3.8 匯出（電腦 A；手機各試一次第 1 項）

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| E-1 看板備份 | 水果部 → 設定 → 備份 →「匯出備份」 | 下載一個 JSON；用記事本打開搜尋「上限測試」找得到，內容 50 行 | 提示；下載列（只截檔名與大小） |
| E-2 全部資料 | 會長室管理 →「匯出全部資料」 | 下載 `學生會看板_全部資料_stustsa-council_日期.json`；檔案裡有 `roles`、`auditLogs`。這個檔有信箱，存在只有你看得到的地方，不要傳到群組 | 提示；檔名與大小 |
| E-3 手機 | iPhone Safari、Android Chrome 各做一次 E-1 | 檔案存得下來（iPhone 會跳分享選單或存到「檔案」） | 存檔時的畫面 |

### 3.9 全部做完之後

- 開發專案裡的測試資料（卡片、角色、稽核紀錄）先留著，不影響任何正式部門（待決定 6）。
- 把每一項的結果（過／不過＋截圖）交給決策端。不過的項目不要自己改設定或程式。
- 如果要退回：見水果部 PR 的說明（開一個把水果部改回 `github` 的 PR，或 revert）；`data-fruit.json` 沒有被動過。

---

## 4. 正式專案（2026-11-20 改寫：使用者決定另建正式專案，不沿用開發專案）

由決策端（學生會公用帳號）在主控台操作；我不建專案、不登入、不部署。順序：4.1～4.6 建好 → 4.7 部署規則與索引 → 4.8 換設定的 PR（水果部在正式專案再匯入一次當演練）→ 九個部門同一天切換（`docs/遷移步驟.md`）。全部在 11/24 行政會議之前做完，切換排在會議之後。

### 4.1 建專案

1. 打開 https://console.firebase.google.com/ （學生會公用帳號）→「建立專案」（或「新增專案」）。
2. 專案名稱填 `南臺科大學生會看板`。下面的專案 ID 改成 `stustsa-council`（被用過時主控台會自動加尾碼，例如 `stustsa-council-1a2b3`；**以畫面上最後顯示的為準**，抄下來，下面的 `stustsa-council` 都是它）。專案 ID 建好就不能改。
3. 「為這個專案啟用 Google Analytics」→ 關掉 → 建立專案。
4. 算成功：進到專案總覽，左上角是「南臺科大學生會看板」。方案是 **Spark**（左下角寫「Spark 免付費」）；**不要按「升級」、不要連結帳單帳戶**（不連帳單就不可能被收費；Cloud Functions、Blaze 都不用）。

### 4.2 Firestore 資料庫

1. 左側「建構」→「Firestore Database」→「建立資料庫」。
2. 資料庫 ID 保留 `(default)`；位置選 **`asia-east1`（台灣）**（建好就不能改）。
3. 安全性規則選「**以正式版模式啟動**」（全部拒絕；正式規則在 4.7 部署）→ 建立。
4. 算成功：https://console.firebase.google.com/project/stustsa-council/firestore/databases/-default-/data 是空的資料庫，上方寫 `(default)`、位置 `asia-east1`。

### 4.3 登入方式與授權網域

1. 左側「建構」→「Authentication」→「開始使用」→「登入方式」分頁 →「Google」→ 啟用 →「專案的公開名稱」填 `南臺科大學生會`、「專案支援電子郵件」選公用帳號 → 儲存。其他登入方式都不開。
2. 「設定」分頁 →「授權網域」：
   - 加入 `stustsa.github.io`。
   - **刪掉 `localhost`**（正式專案不留本機入口）。
   - 保留預設的 `stustsa-council.firebaseapp.com`（登入視窗用的就是它，刪了會不能登入）與 `stustsa-council.web.app`。
   - **不要加**舊網域 `linkmasterking.github.io`。
3. 算成功：授權網域清單只有 `stustsa-council.firebaseapp.com`、`stustsa-council.web.app`、`stustsa.github.io` 三個。

### 4.4 Google 登入畫面（Google Auth Platform）

1. 打開 https://console.cloud.google.com/auth/overview?project=stustsa-council （同一個公用帳號；第一次會要你「開始使用」）。
2. 「品牌宣傳」（Branding）：**應用程式名稱填 `南臺科大學生會`**；使用者支援電子郵件、開發人員聯絡資訊都選公用帳號。**不要上傳標誌**（上傳標誌就要送 Google 審核品牌）；應用程式首頁、隱私權政策連結可以先空著。
3. 「目標對象」（Audience）：使用者類型「**外部**」；發布狀態按「**發布應用程式**」改成「**實際運作中（正式版）**」。只用預設的範圍（email、profile、openid），不需要 Google 審核。
   - 如果這裡只能選「內部」或出現學校組織的限制：不要改組織設定，截圖給決策端（`docs/architecture/verification.md` 第 9.2 節）。
4. 算成功：「目標對象」寫「外部」「實際運作中」；登入時 Google 的畫面寫「繼續使用 南臺科大學生會」。

### 4.5 註冊網頁應用程式（拿 `dept/config.js` 要用的四個值）

1. 專案總覽 → 畫面中間的「</>」（網頁）→ 應用程式暱稱填 `看板網站` → **不要勾**「同時為這個應用程式設定 Firebase 代管」→ 註冊應用程式。
2. 畫面上的 `firebaseConfig` 裡抄 `apiKey`、`authDomain`、`projectId`、`appId` 四個值（之後在 ⚙ 專案設定 →「一般」最下面也看得到）。這四個不是機密，會放進 repo；`storageBucket`、`messagingSenderId`、`measurementId` 不用。
3. 算成功：`authDomain` 是 `stustsa-council.firebaseapp.com`、`projectId` 是 `stustsa-council`。

### 4.6 擁有者（IAM）

- 照第 2.3 節：⚙ 專案設定 →「使用者和權限」→ 擁有者只有公用帳號＋1 個備援帳號（決定 D9），備援帳號要點邀請信接受；兩個帳號都開兩步驟驗證。
- 正式專案不加開發者的個人帳號（要看資料用網站上的總管理員）。

### 4.7 部署規則與索引到正式專案

- 照第 1.3（規則，主控台貼上）＋1.4（索引，Cloud Shell）做，把網址裡的 `stustsa-council-dev` 換成 `stustsa-council`，Cloud Shell 的 `--project` 也換成 `stustsa-council`。
- 用部署當天 `main` 的版本：Cloud Shell 第 2 步的 `C=` 換成 `main` 最新的 commit（GitHub 網頁 repo 首頁「commits」最上面那一筆的完整 SHA），印出的兩個 SHA-256 要跟最後一個合併的 PR 說明寫的一樣（2026-11-20 時：規則 `32208b52…`；秘書處會議編輯的 PR 合併後是 `76e470cb…`；索引 `dbe4e2c3…`）。
- 正式專案是空的，部署索引不會問要不要刪掉舊索引。
- 算成功：規則頁最上面一行是 `rules_version = '2';`、左側歷史有剛剛那一筆；索引頁「複合」22 列全部「已啟用」、「單一欄位」的「豁免項目」14 列。

### 4.8 換設定的 PR（`dept/config.js`）與水果部的演練

**要換的欄位**：只換 `BOARD_BASE.firebase` 那一行的四個值，其他欄位不要加（不要 `emulator`）：

| 欄位 | 11/20 之前（開發專案） | 換成（正式專案，2026-11-20 的 PR） |
|---|---|---|
| `apiKey` | 開發專案的 | `AIzaSyB9z0EsAT4uVUgfOcqEkibRf4wlDisN6uU` |
| `authDomain` | `stustsa-council-dev.firebaseapp.com` | `stustsa-council.firebaseapp.com` |
| `projectId` | `stustsa-council-dev` | `stustsa-council` |
| `appId` | 開發專案的 | `1:541648735824:web:0c0295c2004d1e478c4b55` |

那一行上面的註解改成「正式專案 stustsa-council」。這個 PR 只改這一行（跟任何部門的切換分開合併）；把四個值給我就可以開，或決策端自己在 GitHub 網頁改。

**合併後會發生什麼**：九個部門還是 `github`，畫面與存檔都不變（行事曆的「活動」「會議」不受測試部門影響，#81）。水果部（`source: "firestore"`、測試部門）改讀**正式專案**，正式專案一開始是空的。開發專案裡的資料不會搬過去，也不會再被網站用到。

**水果部的演練（使用者決定：在正式專案再匯入一次）**，合併後依序：

1. 第一位總管理員：要當總管理員的人打開 `https://stustsa.github.io/council/index.html?d=fruit` → 設定 → 用 Google 登入 → 決策端照第 2.1 節在**正式專案**的主控台建 `roles/{UID}` 與 `auditLogs/roles_{UID}_1`（網址裡的專案換成 `stustsa-council`）。重新整理後看到「總管理員」膠囊與「會長室管理」。
2. 網站上的備援總管理員（第 2.3 節最後一段）也在這時候授予。
3. 匯入水果部：照 `docs/遷移步驟.md` 第 3.4 節的匯入步驟做一次（記 commit 與 `data-fruit.json` 的 SHA-256 → 會長室管理 → 匯入 → 水果部（標「新資料庫」）→ 填兩格 → 確認畫面 → 確認匯入）。算成功：報告最上面是 `stustsa-council`、每一列「相同」、「結果：通過」、衝突 0。
4. 快速實測（第 3 節挑這幾項，在正式專案上）：L-1 電腦 Chrome 登入、W-1 50 行＋10 個超連結、W-2 改一行、Q-1 QR 邀請、R-1 撤權、D-1 刪除卡片、E-1／E-2 匯出、設定 → 編輯紀錄讀得到。
5. 演練用的卡片、角色留在正式專案沒關係（水果部是測試部門，不在總覽）；要清的話照 `docs/遷移步驟.md` 附錄 A.4.1 第 2 步在主控台刪 `deptId == fruit` 的文件。

**出問題時**：revert 這個 PR → 水果部回到開發專案，九個部門本來就沒受影響。

### 4.9 其他（可選、之後再做）

| 項目 | 怎麼做 | 注意 |
|---|---|---|
| API 金鑰限制網站來源 | Google Cloud 主控台 → API 和服務 → 憑證 → 自動建立的 Browser key → 應用程式限制「網站」：`https://stustsa.github.io/*`、`https://stustsa-council.firebaseapp.com/*` | 設錯會讓登入壞掉；要做的話先在開發專案試（待決定 7） |
| 備份 | D11：每週一次＋切換前後，會長室管理 →「匯出全部資料」存到公用帳號雲端硬碟的幹部資料夾 | Spark 沒有排程備份 |
| 用量 | Firestore →「用量」：Spark 每天 5 萬次讀、2 萬次寫、儲存 1 GiB | 超過當天讀寫不了（不會收費） |

---

## 5. 待決定（先用最保守的做法）

| # | 事項 | 現在的做法 | 選項 |
|---|---|---|---|
| 1 | 彈出視窗被擋時的「整頁跳轉」登入，在新版 Safari、Chrome、Firefox 很可能回來仍是未登入：網站在 `stustsa.github.io`、登入用的 `authDomain` 在 `stustsa-council.firebaseapp.com`，瀏覽器的第三方儲存隔離會讓跳轉的結果讀不回來（Firebase 官方文件「Best practices for using signInWithRedirect on browsers that block third-party storage」） | 不改程式，等 L-2、L-3 的實測結果 | (a) 接受只用彈出視窗，被擋時提示「請允許彈出式視窗」；(b) 把登入輔助頁放在同一個網域（要另一個 `stustsa.github.io` 根目錄的 repo，並改 OAuth 重新導向網址）；(c) 自訂網域 |
| 2 | 安裝成 App 從總覽開始，水果部不在總覽，iPhone 的 App 可能進不了水果部（L-4），Android 要靠連結在 App 裡打開（L-6） | 不改程式，照實記錄 | (a) 接受，App 的登入等第一個正式部門切換時再測；(b) 暫時讓水果部出現在總覽（所有人看得到一個「水果部」）；(c) 加一個只有網址參數才出現的測試入口 |
| 3 | ~~（已決定 b，#81 已合併）~~ 水果部一切成 `firestore`，**其他八個部門**的通知頁行事曆「活動」「會議」會改去讀開發專案（`store.js` 的 `storeScopeOn`：只要有任何部門是 firestore 就讀，沒排除測試部門）。沒用 Google 登入的人會看到「登入後才看得到」（原本是空的）；主頁的全會行事曆會多連一次 Google（讀公開活動，開發專案裡沒有，畫面仍是空的）。不寫資料、不影響資料檔 | **已決定 b**（2026-11-19）：[STUSTSA/council#81](https://github.com/STUSTSA/council/pull/81) 讓測試部門不算進 `storeScopeOn`，排在水果部 PR 之前合併 | (a) 接受（實測期間的小差異）；(b) 讓測試部門不算進 `storeScopeOn`（一行程式，另開 PR） |
| 4 | ~~正式專案的授權網域要不要拿掉 `localhost`~~ **已決定（2026-11-20）：拿掉**，也不加舊網域 | 清單建議拿掉；開發專案保留 | 留著的話任何人都能在自己電腦跑一份連正式專案的網站並登入（規則仍然擋權限，只是多一個入口） |
| 5 | 開發專案授權網域若還有 `linkmasterking.github.io` | 不動 | 拿掉（舊網址已移轉） |
| 6 | 實測完開發專案裡的測試資料 | 留著 | 用主控台刪掉水果部的 `cards`、`events`、`issues`、`weeks`、`labels`（`docs/遷移步驟.md` 附錄 A.4.1 的做法） |
| 7 | 正式專案的 API 金鑰限制網站來源 | 不做（可選） | 先在開發專案試，確認登入、匯入、QR 都正常再套到正式專案 |
| 8 | ~~換成正式專案設定時，水果部怎麼辦~~ | **已決定（2026-11-20）：(b) 在正式專案再匯入一次當演練**（第 4.8 節） | — |
| 9 | 網站上的備援總管理員是誰 | 未定 | 建議會長室一人（2.3 最後一段） |
