# Google 登入上線準備（開發專案 `stustsa-council-dev`＋水果部實測）

- 寫於 2026-11-19，依據 `main` 的 `66a71ee`（規則與索引最後一次修改是 `e49bd5f`，2026-11-17）。
- 這份只是準備：**沒有部署、沒有登入任何主控台、沒有建專案、沒有改 `data*.json`**。下面每一步都由 DievE 用學生會公用帳號自己操作。
- 順序：第 1 節部署 → 合併水果部的 PR（第 3.0 節）→ 第 2 節建第一位總管理員 → 第 3 節實測 → 第 4 節正式專案（之後）。
- 主控台的按鈕名稱照繁體中文介面寫；Google 常改介面，找不到同名按鈕時看網址列對不對（每一步都附網址）。

---

## 1. 部署包（只部署到開發專案）

### 1.1 要部署的檔案

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
- 水果部的 PR 已合併（只把水果部改成 `source: "firestore"`，指向開發專案），等 1～2 分鐘。測試修正的 PR（分支 `tests-config-source`）排在它前面合併：不影響網站，只是不先合的話之後跑測試會失敗。
- 第 2 節的總管理員已建立。
- 網址一律用 https://stustsa.github.io/council/index.html?d=fruit （水果部不在總覽裡，只能用網址進）。
- 準備：電腦（Chrome）、iPhone、Android 手機；三個 Google 帳號：A＝總管理員（你）、B＝一個沒有任何角色的帳號（個人 Gmail）、C＝學校帳號（R-02 用）。

每一項記下：裝置型號、系統版本（iOS 17.x、Android 14…）、瀏覽器、時間、結果（過／不過）、畫面文字。

**截圖的共同原則**：整個螢幕含網址列；提示訊息（畫面下方的小黑框）約 3 秒就消失，來不及就用錄影；電腦另外按 F12 →「Console」分頁截紅字。不要截「匯出全部資料」檔案的內容（有信箱）；任何時候都不要截 GitHub 權杖的畫面。

### 3.1 準備步驟（依序，只做一次）

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| S-1 匯入頁 | 電腦 Chrome、帳號 A：水果部 → 設定 → 會長室管理 →「匯入」→ 清單裡水果部標「新資料庫」→ 點它 → 跳出「匯入 水果部（已切到新資料庫）」→ 按「匯入」 | 依序顯示讀取、寫入、檢查；報告最上面是 `stustsa-council-dev`，下一行 `data-fruit.json · STUSTSA/council · commit …`；表格每一列「相同」、V1～V6「通過」、最下面「結果：通過」「衝突 0」。再按「再匯入一次」：寫入 0、衝突 0、結果通過 | 整張報告（只有數量與代號，沒有機密）；失敗時的紅字 |
| S-2 匯入頁的權限 | 帳號 B（另一個瀏覽器或無痕視窗）登入水果部 → 設定 | 沒有「會長室管理」 | 設定清單 |

S-1 要排在任何看板寫入之前：水果部的資料檔是空的，先寫了卡片再匯入，報告的卡片數會「不同」（照遷移手冊，報告只在開放編輯前有意義）。

### 3.2 第一件事：50 行、10 個超連結的卡片（電腦 Chrome，帳號 A）

這是規則上限，正式環境的運算量上限只能在這裡驗（模擬器是 18／22 個固定索引，`verification.md` 第 11 節〔待驗證〕）。

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| W-1 建卡 | 即時回報 → 右下新增 → 名稱「上限測試」→ Enter 進內容 → 打「1」Enter「2」Enter …一直到「50」（50 行；第 51 次 Enter 不會再多一行，或出現上限提示）→ 工具列「超連結」加 10 個（名稱 L1～L10、網址 `https://example.com/1`～`/10`）→ 按第 11 次「超連結」出現「最多 10 個超連結」→ 點卡片外面（或 Esc）存檔 | 卡片上的儲存回饋是已儲存、沒有「儲存失敗」；重新整理後卡片還在、內容 50 行、10 顆超連結；卡片上的編輯次數小膠囊是 1 | 卡片下方的儲存回饋文字；F12 Console 紅字（有 `evaluation`、`limit`、`expression` 字樣請整段截，代表超過正式環境的運算上限） |
| W-2 改一行 | 同一張卡片把第 25 行改成「25 改」→ 存 | 已儲存；重新整理後還在；編輯次數 2；設定 → 編輯紀錄有這一筆 | 同上 |
| W-3 加時間 | 同一張卡片加一個時間（工具列「時間」）→ 存 | 已儲存（50 行＋10 超連結＋時間同一批） | 同上 |

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
| D-3 主控台對照（可選） | https://console.firebase.google.com/project/stustsa-council-dev/firestore/databases/-default-/data → `auditLogs` | 有 `cards_fruit__…_purge_…` 與 `issues_fruit__…_delete_…` 兩份；`cards` 裡沒有「刪除測試」 | 文件清單（只截 ID 那一欄） |

### 3.8 匯出（電腦 A；手機各試一次第 1 項）

| # | 做什麼 | 看到什麼算過 | 失敗時截哪裡 |
|---|---|---|---|
| E-1 看板備份 | 水果部 → 設定 → 備份 →「匯出備份」 | 下載一個 JSON；用記事本打開搜尋「上限測試」找得到，內容 50 行 | 提示；下載列（只截檔名與大小） |
| E-2 全部資料 | 會長室管理 →「匯出全部資料」 | 下載 `學生會看板_全部資料_stustsa-council-dev_日期.json`；檔案裡有 `roles`、`auditLogs`。這個檔有信箱，存在只有你看得到的地方，不要傳到群組 | 提示；檔名與大小 |
| E-3 手機 | iPhone Safari、Android Chrome 各做一次 E-1 | 檔案存得下來（iPhone 會跳分享選單或存到「檔案」） | 存檔時的畫面 |

### 3.9 全部做完之後

- 開發專案裡的測試資料（卡片、角色、稽核紀錄）先留著，不影響任何正式部門（待決定 6）。
- 把每一項的結果（過／不過＋截圖）交給決策端。不過的項目不要自己改設定或程式。
- 如果要退回：見水果部 PR 的說明（開一個把水果部改回 `github` 的 PR，或 revert）；`data-fruit.json` 沒有被動過。

---

## 4. 正式專案要準備的事（先寫成清單，現在不建）

### 4.1 建專案（學生會公用帳號，決定 A3）

| # | 設定 | 值 | 注意 |
|---|---|---|---|
| P-1 | 專案名稱／ID | 例：名稱「南臺科大學生會看板」、ID `stustsa-council`（ID 建好就不能改） | ID 會出現在 `authDomain` 與登入畫面網址 |
| P-2 | Google Analytics | 不啟用 | 不需要 |
| P-3 | 方案 | Spark（免費，預設）；**不連結帳單帳戶** | 不連帳單就不可能被收費；Cloud Functions、Blaze 不啟用（CLAUDE.md） |
| P-4 | Firestore | 建立 `(default)` 資料庫，原生模式，位置 `asia-east1`（台灣），以「正式版模式」開始（全部拒絕） | 位置建好就不能改 |
| P-5 | Authentication → 登入方式 | 只啟用 Google；支援電子郵件＝公用帳號 | 其他登入方式不開 |
| P-6 | Authentication → 設定 → 授權網域 | `stustsa.github.io`（預設會有 `<ID>.firebaseapp.com`、`<ID>.web.app`、`localhost`） | 建議正式專案拿掉 `localhost`（待決定 4）；不要加舊的 `linkmasterking.github.io` |
| P-7 | Google Auth Platform（OAuth 同意畫面） | 使用者類型「外部」、發布狀態「正式版」；應用程式名稱「南臺科大學生會工作看板」、使用者支援信箱與開發人員聯絡信箱＝公用帳號；範圍只用預設（email、profile、openid） | **不要上傳標誌**（上傳標誌就要送 Google 審核品牌）；專案若在學校組織底下，類型不要選「內部」（只剩學校帳號能登入） |
| P-8 | 註冊網頁應用程式 | 專案總覽 →「</>」→ 暱稱「看板網站」→ 不勾 Hosting → 註冊 | 畫面上的 `firebaseConfig` 就是 4.2 要用的值（不是機密） |
| P-9 | IAM（使用者和權限） | 擁有者只有公用帳號＋1 個備援帳號（D9），兩個都開兩步驟驗證 | 跟 2.3 同樣做法 |
| P-10 | API 金鑰限制（可選） | Google Cloud 主控台 → API 和服務 → 憑證 → 自動建立的 Browser key → 應用程式限制「網站」：`https://stustsa.github.io/*`、`https://<ID>.firebaseapp.com/*` | 設錯會讓登入壞掉；要做的話先在開發專案試（待決定 7） |
| P-11 | 規則與索引 | 同第 1 節，網址與 `--project` 換成正式專案 ID | 先開發專案驗收過才做 |
| P-12 | 第一位總管理員、備援擁有者 | 同第 2 節，換成正式專案 | 一定要在有人能登入（config 換好、有一個 firestore 部門）之後 |
| P-13 | 備份 | D11：每週一次＋每次部門切換前後，「匯出全部資料」存到公用帳號雲端硬碟的幹部資料夾 | Spark 沒有排程備份 |
| P-14 | 用量 | Firestore → 用量：Spark 每天 5 萬次讀、2 萬次寫、儲存 1 GiB | 超過當天就讀寫不了（不會收費） |

### 4.2 `dept/config.js` 要換的欄位

只換 `BOARD_BASE.firebase` 這一行的四個值（其他欄位不要加）：

| 欄位 | 現在（開發專案） | 換成 |
|---|---|---|
| `apiKey` | 開發專案的 | P-8 畫面上的 `apiKey` |
| `authDomain` | `stustsa-council-dev.firebaseapp.com` | `<正式 ID>.firebaseapp.com` |
| `projectId` | `stustsa-council-dev` | `<正式 ID>` |
| `appId` | 開發專案的 | P-8 畫面上的 `appId` |

- 這是一個獨立的 PR，跟任何部門的切換分開合併（`docs/遷移步驟.md` 第 1 節第 6 步）。
- **合併這個 PR 的同時，水果部會改讀正式專案**（正式專案裡沒有水果部的資料）：先決定水果部要切回 `github`，還是在正式專案再匯入一次當正式演練（待決定 8）。
- 合併後，開發專案就只有在本機或另開分支時才會用到；開發專案的資料不會自動搬到正式專案。

---

## 5. 待決定（先用最保守的做法）

| # | 事項 | 現在的做法 | 選項 |
|---|---|---|---|
| 1 | 彈出視窗被擋時的「整頁跳轉」登入，在新版 Safari、Chrome、Firefox 很可能回來仍是未登入：網站在 `stustsa.github.io`、登入用的 `authDomain` 在 `stustsa-council-dev.firebaseapp.com`，瀏覽器的第三方儲存隔離會讓跳轉的結果讀不回來（Firebase 官方文件「Best practices for using signInWithRedirect on browsers that block third-party storage」） | 不改程式，等 L-2、L-3 的實測結果 | (a) 接受只用彈出視窗，被擋時提示「請允許彈出式視窗」；(b) 把登入輔助頁放在同一個網域（要另一個 `stustsa.github.io` 根目錄的 repo，並改 OAuth 重新導向網址）；(c) 自訂網域 |
| 2 | 安裝成 App 從總覽開始，水果部不在總覽，iPhone 的 App 可能進不了水果部（L-4），Android 要靠連結在 App 裡打開（L-6） | 不改程式，照實記錄 | (a) 接受，App 的登入等第一個正式部門切換時再測；(b) 暫時讓水果部出現在總覽（所有人看得到一個「水果部」）；(c) 加一個只有網址參數才出現的測試入口 |
| 3 | 水果部一切成 `firestore`，**其他八個部門**的通知頁行事曆「活動」「會議」會改去讀開發專案（`store.js` 的 `storeScopeOn`：只要有任何部門是 firestore 就讀，沒排除測試部門）。沒用 Google 登入的人會看到「登入後才看得到」（原本是空的）；主頁的全會行事曆會多連一次 Google（讀公開活動，開發專案裡沒有，畫面仍是空的）。不寫資料、不影響資料檔 | 照現況，寫在 PR 說明 | (a) 接受（實測期間的小差異）；(b) 讓測試部門不算進 `storeScopeOn`（一行程式，另開 PR） |
| 4 | 正式專案的授權網域要不要拿掉 `localhost` | 清單建議拿掉；開發專案保留 | 留著的話任何人都能在自己電腦跑一份連正式專案的網站並登入（規則仍然擋權限，只是多一個入口） |
| 5 | 開發專案授權網域若還有 `linkmasterking.github.io` | 不動 | 拿掉（舊網址已移轉） |
| 6 | 實測完開發專案裡的測試資料 | 留著 | 用主控台刪掉水果部的 `cards`、`events`、`issues`、`weeks`、`labels`（`docs/遷移步驟.md` 第 4.1 節的做法） |
| 7 | 正式專案的 API 金鑰限制網站來源 | 不做（可選） | 先在開發專案試，確認登入、匯入、QR 都正常再套到正式專案 |
| 8 | 換成正式專案設定時，水果部怎麼辦 | 未定 | (a) 同一個 PR 把水果部改回 `github`；(b) 在正式專案再匯入水果部，當第一個正式部門切換的演練 |
| 9 | 網站上的備援總管理員是誰 | 未定 | 建議會長室一人（2.3 最後一段） |
