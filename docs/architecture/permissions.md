# 資料分級、角色與權限矩陣

## 1. 資料分級（依決定 A2 修正）

| 等級 | 誰能讀 | 內容 |
|---|---|---|
| L0 公開 | 任何人，不用登入 | `departments`（部門名稱與外觀）、`org/config`、`events` 中 `visibility == 'public'` 的公開活動 |
| L1 內部 | **任何已登入的 Google 帳號，不需審核**（02A 定案，取代 01A-R 的已授權檢視者，見第 2.1 節） | 看板內容：`deptSettings`、`cards`（`open`／`done`）、`cards/{id}/versions`（只限 `open`／`done` 的卡片）、`issues`、`weeks`、`labels`、`events`（全部非公開的）、`profiles`、`legacyIdentities`、`grants`、`calendars`、`openWindows`、`slots`（只有忙／閒） |
| 本人 | 登入者自己 | `users/{自己}`、`roles/{自己}`、自己的 `roleRequests`、自己的 `bookings`、`bookingQuota` |
| L2 部門 | 該部門管理員／編輯者 | 該部門**刪除中**的卡片（`state == 'purging'`）與它的版本，只給前端接續清除用（02A 修正：沒有「已刪除、可復原」的卡片了，見第 5.1 節） |
| L3 秘書處授權 | 秘書處管理員／編輯者、總管理員 | `meetingMinutes`、`attendance*` |
| L4 會長室 | 總管理員 | 全部 `roles`、`roleRequests`、`invitations`、`auditLogs`、`migrations`、`users` |
| 預約管理者 | `calendars/{ownerId}.managers` 列出的 UID | 該行事曆的 `bookings`、`busyBlocks`（私人標題）。**會長私人行程不在 L1 開放範圍**（02A），總管理員與會長室部門角色也讀不到 |

### 跟現在比，誰會看不到原本看得到的東西

現在所有部門的資料檔都是公開的。切換後，**沒登入的人只看得到部門名稱與公開活動**；登入任何 Google 帳號就看得到全部看板內容（02A）；從 LINE 內建瀏覽器點進來的人，要先用外部瀏覽器開啟並登入才看得到看板內容（Google 會擋內建瀏覽器的登入〔推論，02 實機驗證〕）。02 的畫面要在未登入時清楚說明這一點。

## 2. 角色

| 角色 | 怎麼取得 | 能做什麼 |
|---|---|---|
| 未登入 | | 讀 L0 |
| 一般登入者 | 用 Google 登入，沒有 `roles` 文件（或 `roles` 裡沒有任何權限） | 讀 L0、L1（**02A 修正：不需審核**）；建立自己的 `users`／`profiles`；提出部門角色申請。**不能寫任何看板內容** |
| ~~已授權檢視者 `viewer`~~ | 02A 取消 | 登入就能讀，不再有檢視申請與檢視邀請；`roles` 不接受 `viewer` 欄位 |
| 部門編輯者 `editor` | QR 邀請或申請經總管理員核准 | 該部門的卡片、議題、週報、標籤、時間事件的新增與修改；**永久刪除該部門的卡片**（02A，見第 5.1 節）；不能刪議題、週報、標籤（02D D-d） |
| 部門管理員 `admin` | 同上 | 編輯者的權限＋該部門 `deptSettings`＋刪除該部門的議題、週報、標籤（02D D-d，同批寫刪除紀錄，第 5.1g 節） |
| 會長室總管理員 `super` | 第一位由主控台手動建立；之後由總管理員授予 | 全部讀寫（角色、邀請、稽核、遷移）；刪卡片也走同一個永久刪除流程；不能取消自己的 `super` |
| 預約管理者 | `calendars/{ownerId}.managers` | 管理該行事曆的開放時段、私人忙碌、審核預約 |

部門別帶來的特殊權限（不是另一種角色）：

| 條件 | 額外權限 |
|---|---|
| 秘書處編輯者＋`grants/meetingEdit.until` 未到期 | 修改任何部門 `report == true` 的卡片內容與其時間事件 |
| 秘書處編輯者 | 把時間事件標成 `scope: 'all-meeting'`；讀寫 L3 |
| 活動部編輯者 | 把任何部門的時間事件標成 `scope: 'all-activity'`；發布公開活動（見決策 D4） |

### 2.1 登入可讀（02A 定案，取代 01A-R 的已授權檢視者）

- **修正**：01A-R 的「已授權檢視者」（`roles.viewer`、檢視申請、檢視邀請）整個取消。`internalReader()` 改回 `signedIn()`：任何用 Google 登入、信箱已驗證的帳號都能唯讀 L1，不需審核。
- 不在開放範圍（維持原本限制）：秘書處點名名單與會議紀錄（`attendance*`、`meetingMinutes`，L3）、會長私人行程（`busyBlocks` 的標題、`bookings` 的內容，只有行事曆管理者與申請人本人）、L4。
- 寫入不變：所有寫入條件都用 `isEditor`／`isAdmin`／`isSuper`／`isManager`，一般登入者什麼都不能寫（N-04）。
- 後果（請知悉）：任何人用任何 Google 帳號登入就看得到各部門的看板內容、專員名字（`profiles.displayName`）與舊身分名字；**撤權只收回寫入，收回不了閱讀**。要擋特定帳號閱讀，得另外做封鎖名單（列為待決定，見 [README.md](README.md)）。
- 01A-R 的 I-47～I-49、C-17、C-19 依這個決定改寫（見第 5.1a 節、[invitations-roles-audit.md](invitations-roles-audit.md) 第 8 節）。

是否保留 `editor` 這一級、部門管理員能不能自己發邀請：見決策 D2、D3（02A 不變）。規則已經支援兩級；如果只要一級，管理員以外都不發 `editor` 就好，規則不用改。

## 3. 權限矩陣

R＝讀、C＝新增、U＝修改、D＝硬刪；「部門」＝文件的 `deptId` 是自己有角色的部門。

| 集合 | 未登入 | 一般登入 | 部門編輯者 | 部門管理員 | 總管理員 | 備註 |
|---|---|---|---|---|---|---|
| `departments` | R | R | R | R | RCUD | |
| `org/config` | R | R | R | R | RCU | |
| `deptSettings` | | R | R | RU（部門） | RCUD | |
| `users/{uid}` | | 本人 RCU | 本人 | 本人 | R | 信箱必須等於登入信箱 |
| `profiles/{uid}` | | R；本人 CU | 同左 | 同左 | RU | |
| `deptMembers/{dept}__{uid}`（03 F3） | | | R（部門）；本人 C、D；過期的 D | 同左 | RCD | 只有部門與 uid（專員名單），名字從 `profiles`；見第 5.1h 節 |
| `roles/{uid}` | | 本人 R；核銷邀請時本人 CU | 同左 | 同左 | RCU（不能動自己的 `super`） | 見 [invitations-roles-audit.md](invitations-roles-audit.md) |
| `roleRequests` | | 本人 RC、本人撤回（只能申請部門的 `admin`／`editor`） | 同左 | 同左 | RU（核准要同批改 `roles`） | |
| `invitations` | | 知道權杖者 get；核銷 U | 同左 | 同左（D3 開放則可對自己部門 C） | RCU | 不能 list |
| `legacyIdentities` | | R；核銷認領 U | 同左 | 同左 | RCU | |
| `auditLogs` | | 只能隨受保護的寫入一起 C | 同左（＋開始永久刪除卡片時 C 刪除紀錄） | 同左（＋刪議題、週報、標籤時 C 刪除紀錄） | R | 任何人都不能 U、D；卡片刪除紀錄見第 5.1c 節（02B）；議題、週報、標籤的刪除紀錄見第 5.1g 節（02D D-d） |
| `cards` | | R（`open`／`done`） | RCU（部門）＋D（部門，永久刪除流程）＋讀刪除中 | 同左 | RCU＋D（永久刪除流程或遷移回復） | 秘書處授權期間可 U 報告事項，不能刪；D 的條件見第 5.1 節（02A 修正） |
| `cards/{id}/versions` | | R（**只限卡片可讀時**） | R 同卡片；C（隨卡片）；D（只限永久刪除，由新往舊） | 同左 | R、C；D 同左 | 不能 U；不能單獨 D；跨卡片查詢（collection group）只限本部門或總管理員 |
| `issues`、`weeks`、`labels` | | R | RCU（部門） | RCUD（部門） | RCUD | D 一定要同批寫刪除紀錄（管理員、總管理員都一樣；遷移失敗回復除外），第 5.1g 節（02D D-d） |
| `events` | R（`public`） | R | RCU（部門）；屬於卡片的 D（隨永久刪除，或同批從卡片 `timeIds` 拿掉） | 同左 | RCUD | 全會範圍、公開見第 2 節 |
| `grants/meetingEdit` | | R | R | R | RCU | |
| `meetingMinutes` | | | 秘書處 RCU | 秘書處 RCU | RCUD | |
| `attendance*` | | | 秘書處 RCU | 秘書處 RCU | RCUD | 07 定稿 |
| `calendars`、`openWindows` | | R | R | R | RCU | 管理者 CU |
| `slots` | | R（02A 修正：一般登入者不能申請預約，所以沒有 C、D） | R；隨自己的預約 C；預約批次後已拒絕／取消時 D | 同左 | R | 管理者隨私人忙碌 C；**任何人都不能單獨刪除有效預約或私人忙碌的鎖**；任何人都不能 U（[booking.md](booking.md) 第 4 節） |
| `bookings` | | —（D6：有部門角色才能申請） | 本人 RC、本人取消 | 同左 | 不是管理者就讀不到（02A 修正：原本誤寫 R；規則與 N-12 都是讀不到） | 管理者 RU；會長私人行程不在 L1 開放範圍 |
| `busyBlocks` | | | | | | 只有管理者 RCU；不能硬刪，釋放＝`released`＋同批刪鎖 |
| `migrations` | | | | | RCU | |

## 4. 規則共用函式（設計稿〔待驗證〕）

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function doc(col, id)   { return /databases/$(database)/documents/$(col)/$(id); }
    function signedIn()     { return request.auth != null
                                && request.auth.token.firebase.sign_in_provider == 'google.com'
                                && request.auth.token.email_verified == true; }
    function me()           { return request.auth.uid; }
    function hasRole()      { return signedIn() && exists(doc('roles', me())); }
    function role()         { return get(doc('roles', me())).data; }
    // L1 的定義集中在這一個函式。02A 定案：任何已登入的 Google 帳號（01A-R 的已授權檢視者取消）
    function internalReader() { return signedIn(); }
    function isSuper()      { return hasRole() && role().get('super', false) == true; }
    function deptRole(d)    { return hasRole() ? role().get('depts', {}).get(d, null) : null; }
    function isEditor(d)    { return deptRole(d) in ['admin', 'editor']; }
    function isAdmin(d)     { return deptRole(d) == 'admin'; }
    function now()          { return request.time; }
    function stamped()      { return request.resource.data.updatedAt == request.time
                                && request.resource.data.updatedBy == me(); }
    function unchanged(keys){ return !request.resource.data.diff(resource.data).affectedKeys().hasAny(keys); }
    function onlyChanged(keys) { return request.resource.data.diff(resource.data).affectedKeys().hasOnly(keys); }
    function revNext()      { return request.resource.data.rev == resource.data.rev + 1; }
    ...
  }
}
```

要點：

- 角色每次請求都從 `roles/{uid}` 讀，不用 custom claims，所以**撤權立刻生效**，不用等登入權杖過期（custom claims 要 Admin SDK 或 Functions 才能設〔文件〕）。
- 規則每個操作最多 10 次文件讀取（`get`／`exists`／`getAfter`／`existsAfter`），整批最多 20 次；超過一律拒絕〔文件；10 次上限已驗證 P7〕。同一份文件重複讀取可能會被快取、不計次〔文件〕，但設計不依賴快取：每條規則都按「不快取」計算過次數。
- `signedIn()` 限定 Google 登入，避免日後有人在主控台多開匿名登入或信箱登入時，規則意外放行。

## 5. 一般資料的規則（設計稿〔待驗證〕）

### 5.1 卡片

正式規則在 `backend/firestore.rules` 的「即時回報卡片」段，這裡只寫重點（01A 的設計稿已經被正式規則取代）。

```
match /cards/{id} {
  // 狀態：open | done | purging（02A：拿掉 deleted；purging＝永久刪除進行中，不可逆）
  allow get:  if internalReader() && (resource.data.state != 'purging' || deptWriter(resource.data.deptId));
  allow list: if internalReader() && (resource.data.state in ['open', 'done'] || deptWriter(resource.data.deptId));
  allow create: if cardShape() && (normalCreate() || importCreate()) && verAfter();     // 同批新建第 1 版
  allow update: if cardShape() && unchanged([...])
    && (editorEdit() || meetingEdit() || reorder() || purgeStart() || purgeSweep());
  allow delete: if purgeFinish() || rollbackDelete();
  // editorEdit／meetingEdit：卡片是 open／done、version +1、同批新建版本；從 timeIds 拿掉的時間事件要同批刪掉（droppedGone）
  // purgeStart：open／done → purging，deletedAt＝現在、deletedBy＝自己；同一批新建刪除紀錄（02B，第 5.1c 節）；timeIds 不能動
  // purgeSweep：purging → purging，只改 timeIds（只能減少，拿掉的事件要同批刪）
  // purgeFinish：purging、timeIds 是空的、第 1 版在批次後不存在
  // 以上三步都要 deptWriter(deptId)＝該部門編輯者以上或總管理員
}
match /cards/{cid}/versions/{v} {
  allow get, list: if isSuper() || (internalReader() && exists(卡片) && (卡片.state != 'purging' || isEditor(卡片.deptId)));
  allow create: if 內容＝批次後的卡片 && 批次後卡片是 open／done && (imported == false || 遷移路徑);
  allow update: if false;
  allow delete: if deptWriter(resource.data.deptId)
    && (卡片批次後存在 ? 批次後是 purging : 卡片批次前存在)        // 只能隨永久刪除（或遷移回復）
    && 第 v+1 版批次後不存在;                                     // 由新往舊刪，剩下的永遠是 1～k
}
```

**永久刪除（02A 定案，修正 01A／01A-R 的軟刪除）**

- 刪除就是永久刪除：卡片、它的全部版本（`cards/{id}/versions/*`）、它的全部時間事件（`events` 中 `cardId == id`）一起移除。沒有「已刪除」狀態、沒有「最近刪除」、不能復原；總管理員也沒有「只刪卡片、留下版本」的硬刪。
- 誰能刪：該部門編輯者以上、總管理員。一般登入者、別部門的編輯者、已撤權者、秘書處的會議授權（只能改內容）都不能刪（N-16）。
- 為什麼分三步：規則沒有迴圈、一批最多 500 筆寫入、整批讀取最多 20 次，所以「一次寫入裡檢查全部版本與事件都被刪掉」做不到。改成：
  1. **開始**：卡片改成 `purging`，**同一批新建一筆刪除紀錄**（誰、何時、卡片標題；02B，第 5.1c 節）。從這一刻起一般登入者讀不到卡片與版本（N-17）；`purging` 不能改回 `open`／`done`、不能再寫新版本或新時間事件（C-07、C-20）。02B 修正：開始那一批不刪時間事件（02A 原本可以先刪 3 個；加上刪除紀錄後整批讀取會超過 20），時間事件全部在第 2 步清除。
  2. **清除**（可以多批）：時間事件——卡片的 `timeIds` 列出它**全部**的時間事件（建立時間事件時規則要求它列在母卡片的 `timeIds`，`cardId` 之後不能改），從 `timeIds` 拿掉一個 ID 時那份事件必須同一批刪掉；版本——由新往舊刪，刪第 v 版時第 v+1 版必須已經不在，所以剩下的版本永遠是 1～k。
  3. **刪卡片**：`timeIds` 必須是空的、第 1 版必須已經不在。由上面兩條推得：版本與時間事件都沒有殘留（N-13、N-14）。
- 每批大小（照整批讀取 20 次估算，不依賴快取）：開始那一批 6（卡片 4＋刪除紀錄 2）、時間事件每批 3 個（3×4＋卡片 5＝17）、版本每批 3 個（3×5＋卡片 3＝18）。參考實作：`backend/tests/helpers.js` 的 `purgeStartWrites`、`purgeCard`。前端（看板內容的寫入接上時）照這個順序做；中途關掉瀏覽器時卡片停在 `purging`，同部門編輯者再開看板時接著清除。
- 前端的確認：**卡片含時間標記時，刪除前要求使用者再次確認**（第二次確認要寫出會一起刪掉幾個時間標記）；沒有時間標記的卡片照 `DESIGN.md`「刪除鍵」的規則確認一次。
- 已知限制：時間事件超過 3 個的卡片，第一批之後剩下的時間事件在清除完之前仍是登入可讀（只有名稱、時間、地點，沒有卡片內文；N-17）。正常情況下清除會在幾秒內接著完成。
- 遷移失敗回復（01B R1）另有專用路徑：批次是 `rollingBack`、卡片 `version == 1` 而且是這個批次匯入的，總管理員可以刪卡片＋第 1 版；它的時間事件由回復程式接著刪（`rollbackImport`）。

**其他**

- 卡片與版本互相檢查：卡片規則要求同一批**新建**了對應版本號的版本文件（`verAfter`）；版本規則要求內容（`title`、`blocks`、`state`、`deptId`）、作者、時間都等於批次後的卡片。兩邊都只看批次後的狀態，所以不會有「卡片改了、版本沒寫」或「版本寫的跟卡片不一樣」。
- `times`（當時的時間值快照）來自 `events`，長度不固定，規則沒辦法逐筆比對，**由前端負責**；它只用在歷史顯示，不影響權限。
- 每次內容修改都產生一筆版本（寫入次數 ×2）。「勾選一個核取方塊算不算一個版本」是 04 的設計問題（階段 00 的 8-9）；01B 先全部算版本，04 再決定要不要放寬成「只改 `check` 不加版本」。
- 併發：前端一律用交易，「讀最新 → 改 → 寫回並帶 `version + 1`」。規則的 `version == 舊 + 1` 保證不會有兩個人寫出同一個版本號（C-15；模擬器裡後提交的那筆是被規則拒絕，前端拒絕時重讀重試）。02D 的實作：交易先比對版本，不同就不寫、保留畫面上的修改並提示（不自動重試、不合併），見第 5.1d 節。

### 5.1a 一般資料攻擊測試（01A-R 新增，01B 寫成模擬器測試；02A 修正的項目標在 # 欄）

| # | 情境 | 預期 |
|---|---|---|
| C-01（02A 修正） | 一般登入者 `get` 刪除中（`purging`）的卡片 | 拒絕 |
| C-02（02A 修正） | 一般登入者 `get` 刪除中卡片的任一版本（直接猜 `cards/X/versions/3`） | 拒絕 |
| C-03（02A 修正） | 一般登入者 `list` 刪除中卡片的版本 | 拒絕 |
| C-04 | 一般登入者用 collection group 查詢所有 `versions`（不帶或帶別部門 `deptId`） | 拒絕 |
| C-05（02A 修正） | 同部門編輯者讀刪除中的卡片與版本（接續清除）；清除完任何人（含總管理員）都讀不到殘留 | 允許；不存在 |
| C-06 | 別部門的編輯者讀刪除中卡片的版本 | 拒絕 |
| C-07（02A 修正） | 刪除中的卡片改回 `open`／`done`（復原）、或再寫新版本 | 拒絕 |
| C-08 | 編輯者更新卡片內容但不寫版本 | 拒絕 |
| C-09 | 版本的 `title`／`blocks`／`state`／`deptId`／`by`／`at` 任一項跟批次後的卡片不同 | 拒絕 |
| C-10 | 卡片版本號一次加 2、或沿用舊號 | 拒絕 |
| C-11 | 單獨建立版本文件（同批沒有更新卡片），包括替遷移卡片「補」缺的版本 | 拒絕 |
| C-12（02A 修正） | 總管理員直接刪卡片（留下版本）；有殘留版本時用同一個 ID 重建 | 拒絕（版本必須同批新建）；永久刪除後用同 ID 重建則允許 |
| C-13 | 修改任何版本；卡片沒在刪除時刪除版本（含總管理員） | 拒絕 |
| C-14 | 版本寫 `imported: true`（非遷移路徑） | 拒絕 |
| C-15 | 兩個編輯者同時改同一張卡片 | 各自產生連續版本號，沒有重號；後提交的交易重試 |
| C-16 | 秘書處在 `meetingEdit` 到期後修改報告卡片；修改沒標 `report` 的卡片 | 拒絕 |
| C-17（02A 修正） | 沒有角色的登入者讀 `cards`、`issues`、`events`（非公開）、`profiles`、`slots`；未登入讀同樣的東西 | 登入者允許；未登入拒絕 |
| C-18 | 一般登入者寫任何看板內容（卡片、議題、週報、標籤、時間事件、`deptSettings`） | 拒絕 |
| C-19（02A 修正） | 撤掉部門角色後下一次讀取、寫入；已開的監聽 | 讀取允許、寫入拒絕；監聽照常收到更新 |
| C-20（02A 修正） | 屬於卡片的時間事件沒列在批次後母卡片的 `timeIds`、跟卡片不同部門、卡片不存在或在刪除中；改 `cardId` | 拒絕 |

### 5.1b 02A 負面測試（`backend/tests/rules-02a.test.js`）

| # | 情境 | 預期 |
|---|---|---|
| N-01 | 未登入者 `get`／`list` 十個部門的卡片、版本、議題、週報、標籤、內部時間事件、部門設定，以及 `profiles`、`legacyIdentities`、`grants`、`calendars`、`openWindows`、`slots` | 拒絕；部門名稱與公開活動允許 |
| N-02 | 未登入者寫任何部門的內部資料 | 拒絕 |
| N-03 | 沒有 `roles` 文件、或 `roles` 是空的 Google 帳號讀上面全部；信箱密碼登入、信箱未驗證的帳號讀卡片 | 允許；後兩者拒絕 |
| N-04 | 一般登入者對十個部門做 12 種寫入（新增／修改／排序／開始刪除卡片、新增／修改議題、週報、標籤、新增／修改／刪除時間事件、部門設定） | 全部拒絕 |
| N-05 | 部門編輯者、部門管理員對其他 9 個部門做同樣 12 種寫入；把自己部門的資料改成別的部門 | 全部拒絕；自己部門允許 |
| N-06 | 部分撤權後寫被撤的部門（含自己建的卡片）；全部撤權後寫任何部門；被撤權的人自己把角色寫回去 | 全部拒絕；讀取仍允許 |
| N-07 | QR 竄改：權杖改一個字元、截短、加長、大寫、換成雜湊、換成別張的權杖、空字串；用合法權杖但核銷時改邀請上的部門／角色／期限／綁定信箱 | 全部拒絕；邀請仍是 `active` |
| N-08 | 重放已核銷的 QR：同一人、別人、被撤權後再掃 | 拒絕 |
| N-09 | 過期 1 秒的 QR；核銷時把期限改長；總管理員事後延長期限；建立 10 分 1 秒的邀請 | 拒絕 |
| N-10 | 重新產生：同一批撤銷舊邀請＋建立新邀請；非總管理員重新產生 | 總管理員允許，舊 QR 失效、新 QR 可用；其他人拒絕 |
| N-11 | 一般登入者、各部門編輯者／管理員（含會長室）讀寫秘書處點名名單與會議紀錄 | 拒絕；秘書處、總管理員允許 |
| N-12 | 一般登入者、會長室部門管理員、總管理員讀會長私人行程（`busyBlocks`）與別人的預約 | 拒絕；只看得到 `slots` 的忙／閒；行事曆管理者與申請人本人允許 |
| N-13 | 永久刪除（5 個時間事件、3 個版本；小卡片兩批；總管理員） | 卡片、全部版本、全部時間事件都不存在 |
| N-14 | 留下版本或時間標記的刪法：直接刪卡片、拿掉 `timeIds` 卻不刪事件、一批拿掉超過 3 個、刪除時加新標記、還有事件或版本時刪卡片、版本跳著刪 | 全部拒絕 |
| N-15 | 卡片沒在刪除時單獨刪版本（含總管理員）或刪仍列在卡片上的時間事件；別部門編輯者刪事件 | 拒絕；編輯卡片時同批拿掉並刪除允許 |
| N-16 | 一般登入者、別部門管理員、秘書處（會議授權中）、已撤權者、會長室部門管理員：開始刪除、清除、直接刪、單獨刪事件或版本；接手別人開始的刪除 | 全部拒絕 |
| N-17 | 刪除中的卡片與版本對一般登入者；第一批之後剩下的時間事件 | 卡片與版本拒絕；剩下的事件在清除完前可讀（已知限制） |

### 5.1c 02B 卡片刪除紀錄（`backend/tests/rules-02b.test.js`）

使用者 2026-11-13 決定：卡片永久刪除時留一筆紀錄（誰、何時、卡片標題）。卡片的版本會一起消失，所以這筆紀錄是刪除後唯一留下的東西。

- 文件：`auditLogs/cards_{卡片ID}_purge_{亂數}`，欄位沿用稽核紀錄的白名單：`col: 'cards'`、`docId`＝卡片 ID、`rev`＝卡片當時的 `version`、`action: 'purge'`、`actor`＝自己、`at`＝伺服器時間、`before: {title, deptId, state}`＝被刪的卡片、`after: {state: 'purging'}`、`ref`＝亂數。
- 卡片多一個欄位 `purgeLog`（亂數，8～40 個英數字）：只有「開始永久刪除」能寫，新建卡片、一般編輯都不能帶。規則要求開始刪除時 `auditLogs/cards_{id}_purge_{purgeLog}` **在這一批新建**（批次前不存在、批次後存在），所以：不能略過；同一個卡片 ID 刪掉又重建（C-12 允許）再刪時，不能拿上一次的紀錄充數。
- 紀錄的建立規則：卡片批次前是 `open`／`done`、批次後是 `purging`，`deletedBy`＝自己、`deletedAt`＝這次寫入、`purgeLog`＝`ref`；`before` 必須等於批次前卡片的標題、部門、狀態，`rev` 等於版本號。所以紀錄只能在真的開始刪除那一批寫，內容就是被刪的那張卡片。
- 讀：只有總管理員（跟其他稽核紀錄一樣，在「會長室管理 → 紀錄」看）。改、刪：任何人都不行（含總管理員）。
- 讀取次數：開始那一批卡片 4（刪除權限 2、紀錄 `exists`＋`existsAfter` 2）＋紀錄 2（卡片批次前後各 1）＝6。
- 例外：遷移失敗回復（01B R1，`rollbackDelete`）刪掉「這個批次匯入、沒被改過」的卡片時不寫卡片刪除紀錄；那條路徑只有總管理員、而且遷移批次本身改成 `rollingBack` 時已有稽核鏈（`migrations_{批次}_{rev}`）。

| # | 情境 | 預期 |
|---|---|---|
| D-01 | 部門管理員、總管理員（別部門、已完成的卡片）永久刪除 | 卡片刪光；紀錄留下，內容是誰、何時（伺服器時間）、標題、部門、狀態；總管理員讀得到 |
| D-02 | 開始刪除卻沒寫紀錄（沒有 `purgeLog`、有 `purgeLog` 但同批沒有紀錄、紀錄寫到別的 ID） | 拒絕 |
| D-03 | 紀錄內容不符（標題、部門、狀態、多欄位、`after`、版本號、`actor`、用戶端時間、`action`、`col`、白名單外欄位、亂數格式）；卡片 `deletedBy` 寫別人 | 拒絕 |
| D-04 | 同一個卡片 ID 刪掉又重建，再刪時用上一次的亂數；覆寫舊紀錄 | 拒絕；用新的亂數成功，兩筆紀錄都在 |
| D-05 | 沒在刪卡片卻寫紀錄：卡片仍是 `open`、清除中補寫、卡片不存在、借別張卡片的開始刪除；一般登入者、別部門編輯者替別人寫 | 拒絕 |
| D-06 | 修改、刪除紀錄（含總管理員）；部門編輯者、管理員、一般登入者、未登入讀紀錄 | 拒絕；總管理員讀允許 |
| D-07 | 新建卡片帶 `purgeLog`；編輯卡片時加 `purgeLog` | 拒絕 |

### 5.1d 02D firestore 模式寫入（`core/js/store-write.js`）

D1 時規則沒有改（02D 審查加了文件 ID 限制，第 5.1e 節）；網頁照規則接受的形狀寫入（跟 `backend/tests/helpers.js` 的參考寫法相同）。測試：`tools/tests/fw1.js`（`npm run test:web`，69 項；D1 時 52 項）。

- **誰能寫**：畫面上只有 `roles.depts[部門]` 是 `editor`／`admin`、或 `super` 的人看得到編輯工具（`store.js` 的 `fsWriter`，跟著 `roles` 的監聽即時切換）；真正的把關仍是規則（撤權後在編輯中按儲存、或繞過畫面直接呼叫寫入，都被拒絕：fw1 第 5 段）。
- **寫什麼**：比對「上次讀回來時的畫面資料」與「現在的畫面資料」（`store-map.js` 的 `desired`，兩邊用同一份原始文件補齊畫面上沒有的欄位），只寫內容不同的文件。原本文件裡沒改的欄位沿用讀回來的原值（時間戳記保留微秒，`unchanged` 才會成立）。
  - 卡片：新增＝卡片＋第 1 版同批（`createdAt`＝伺服器時間）；改內容＝`version + 1`＋同批新建那一版（`times` 是當時的時間標記快照）；只換順序＝`update` 只改 `order`（`reorder`）；結案＝`doneAt`＝伺服器時間、移回＝`null`。新建就是完成的卡片（「完成這一段」的完成紀錄）先建成 `open`，下一批再結案（第 2 版）。
  - 時間標記：新增的 `events` 一定列在卡片 `timeIds`（可以跟卡片同批或在後面的批）；改了 `rev + 1`；從卡片拿掉的同一批刪掉，一批最多 3 個，超過就先分批只拿掉時間標記（每批也是一個新版本），最後一批再寫全部內容。換到別張卡片的時間標記（`cardId` 不能改）用新 ID 重建、舊的隨原卡片的修改刪掉；新卡片先寫、舊卡片後改，中途失敗也不會少掉時間標記。
  - 議題 `rev + 1`；週報、標籤沒有 `rev`；議題、週報、標籤的刪除＝部門管理員或總管理員，同批寫刪除紀錄（02D D-d，第 5.1g 節），編輯者的畫面上沒有刪除鍵。
  - 部門設定：`rev + 1`＋同批 `auditLogs/deptSettings_{部門}_{rev}`（`action: 'update'`、`after.fields`＝改了哪些欄位），只有部門管理員與總管理員寫。編輯者新增週報時**不改**週報基準（`reportBase`，在部門設定裡；規則不允許編輯者寫）：02D 審查前畫面會更新、存檔時卻不寫，看起來像改了；現在 `weekly.js` 的 `snapshotBase` 在 firestore 模式只有部門管理員以上才更新（編輯者產出週報後，下一份週報的「本週」仍從管理員上次的基準算起）。
  - 永久刪除：照第 5.1 節三步（開始＋刪除紀錄、亂數 nonce → 時間事件每批 3 個 → 版本由新往舊每批 3 個，最後一批連卡片）。上次中斷的（卡片停在 `purging`），同部門的編輯者下次儲存時先接著清完：02D 審查起先查這張卡片現存的時間標記與版本（`timeIds` 裡沒有文件的 ID 只從清單拿掉，規則不允許編輯者刪不存在的文件，P-01／P-02），而且用自己的一輪寫入，失敗不擋使用者這次的儲存；交易裡比對 `timeIds` 與要刪的文件還在，兩個人同時接著清時後到的重算再試（最多 3 次）。
- **每批讀取**：照本節的算法（不依賴快取）每批不超過 20：議題／週報／標籤 2（刪除＋刪除紀錄 12）、部門設定＋稽核 4、新卡片＋第 1 版 5、改卡片 4＋拿掉的事件數＋版本 1、時間事件 4、只換順序 2、開始刪除 6、清除 5＋4×事件、刪版本 5、刪卡片 3。依序裝批，同一份文件一批只寫一次。
- **併發**：每一批是一個交易，先讀要改的文件，`version`（卡片）、`rev`（議題、時間事件、部門設定）、`updatedAt`（週報、標籤）跟上次讀到的不同就整批不寫（`conflict`），不會蓋掉別人剛存的內容（C-15 前端部分）。
- **失敗**：衝突、沒有權限、斷線都不清掉畫面上的修改，提示原因並可以重新載入（DESIGN「資料來源與暫停編輯」）。一次儲存分成多批、前面的批已寫入而後面失敗時（02D 審查修正）：提示「部分修改已寫入，正在補寫其餘的修改…」，重新讀一次當比對基準，只補寫這次要寫、還沒寫進去的文件（`store.js` 的 `fsFinish`，最多 3 輪；「完成這一段」換過 ID 的時間標記沿用同一個新 ID，不會重建第二份）。上次讀到之後被別人改過或刪掉的文件不補寫，比對基準對那幾份留在舊的（下次儲存照樣被版本檢查擋下，不會蓋掉別人剛存的）；補寫不完時提示「部分修改已寫入；…（還在畫面上）」並保留畫面上的修改。測試：`fw1.js` 第 10 段（擋下第二個 commit → 收斂、時間標記沒有重複）。
- **只在 GitHub 模式有的欄位不寫**：`members`、`sync`、密碼、權杖、`minutes`、`meetGrant`、`yearLabel`／`termStart`／`semester`。
- **不開放（規則沒有對應或要另外設計）**：秘書處跨部門會議編輯（寫的是別的部門）、會長室的會議編輯開關（`grants/meetingEdit` 只有總管理員＋稽核鏈，還沒接畫面）、學年與開學日（`org/config` 只有總管理員）、匯入備份（整份取代；回復路徑是 firestore 模式「匯出備份」→ 改回 github →「匯入備份」，見 [migration.md](migration.md) 第 7 節）、改已完成卡片的完成日期（規則要求 `doneAt`＝伺服器時間或不變）。

- **編輯紀錄與會長室編輯量（02D D3）**：讀版本歷史（collection group `versions` where `deptId` order by `at`，Q9；規則只給總管理員與該部門編輯者，其他人 `permission-denied`）；總管理員另外讀 `auditLogs`（order by `at`），只取部門設定的修改（`deptSettings`、`update`）與卡片刪除（`cards`、`purge`）。遷移產生的第 1 版在編輯紀錄顯示成「遷移｜匯入」，不算進編輯量。議題、週報、標籤沒有歷史（只有最後一次的 `updatedAt`），不在這兩個畫面裡。測試：`fw1.js` 第 7 段。

### 5.1e 02D 獨立審查的修正（`backend/tests/rules-02d.test.js`）

- **文件 ID 限制（P0）**：`cards`、`events`、`issues`、`weeks`、`labels` 新建時文件 ID 必須符合 `^[A-Za-z0-9_-]{1,120}$`（規則 `safeId(id)`，含總管理員）。原因：網頁讀回來時拿掉部門前綴、把 ID 放進畫面的屬性（`data-id`、`data-ev`…），有部門角色的人用 SDK 建一份 ID 帶引號的文件（例如 `rights__x" onmouseover=…`），就能在總管理員打開看板時執行程式＝權限提升。三道防線：① 規則擋下建立；② `store-map.js` 的 `toState` 讀回來時略過 ID 不合格的文件（卡片、時間事件、議題、週報、標籤、舊身分）；③ 看板範本裡所有來自資料的屬性值都經過 `esc`（github 模式的資料檔走同一套範本，也一起變安全）。現有資料檔的 ID（遷移成 `{部門}__{舊 ID}`）與網頁產生的 ID（`uid()`＝英數、`t`＋十六進位）都符合（S-04 只讀資料檔檢查）。
  - S-01 卡片、S-02 時間事件、S-03 議題／週報／標籤：ID 帶引號＋事件屬性、角括號、空白、單引號、`.`、`&`、非英數、超過 120 字 → 編輯者與總管理員都拒絕；合法 ID（含剛好 120 字）可以。
  - S-04 現有十個資料檔的全部 ID 加上最長的部門前綴後都合格。
  - 遷移測試：`toState` 略過不合格 ID 的文件（`migrate.test.js`）。
- **中斷的永久刪除（P1）**：P-01 `timeIds` 裡沒有文件的 ID 可以只從清單拿掉（`onlyShrinks` 的 `!existsAfter` 成立）；P-02 編輯者刪不存在的時間事件被拒絕（`withCard` 讀不到 `resource`），總管理員可以。前端因此先查現存的文件再接著清（第 5.1d 節）；`fw1.js` 第 9 段：有不存在的時間標記時編輯者照常存得進別的修改、刪除接著清完，兩個編輯者同時接著清不會卡住。

### 5.1f 03 卡片逐行內容（`backend/tests/rules-03.test.js`）

- `blocks` 是 `{id, text, check, time}` 四個一樣長的陣列（[data-model.md](data-model.md) 第 3 節），規則 `blocksOk` 在卡片新建、卡片修改（`blocks` 或 `timeIds` 有變、而且不是 `purging`）、版本新建時檢查：四個欄位都要有、不能多；最多 50 行；行 ID 是 `safeId` 而且不重複；每行文字最多 1000 字、不能有換行；`check` 只能是 `null`／`true`／`false`；`time` 是 `null` 或這張卡片 `timeIds` 裡的 ID（也要是 `safeId`）。版本的 `blocks` 仍然要等於批次後卡片的 `blocks`。時間事件的 `blockId` 是 `null` 或 `safeId`。
- 做法：規則沒有迴圈，「每行一個物件」只能逐行展開檢查，模擬器實測卡片＋版本十行就超過每個請求 1000 個運算式的上限，所以改成平行陣列，整欄一次檢查（`join`＋`matches`、`hasOnly`、`hasAll`；「接起來再切開＝原本的陣列」確保每個元素都是字串而且不含分隔字元）。運算式數量跟行數無關，滿 50 行＋時間事件同一批可以寫（L-11）。正式環境的上限是否跟模擬器一樣〔待驗證〕。
- 02D 遷移寫的舊格式（每行一個物件）：沒改 `blocks` 的修改（換順序）與永久刪除照常；改內容一定要換成新格式（網頁一律寫新格式）。
- L-01 三種行、插入一行；L-02 每行 1000／1001 字（中文一個字一個）；L-03 一行裡有換行；L-04 行 ID、時間 ID 帶 HTML／引號／空白／中文／空字串／超過 120 字（文字內容的 HTML 規則照收，畫面跳脫）；L-05 錯型別（長度不一、非字串、`check` 是字串／物件／數字、多欄位、少欄位、不是 map、舊格式新建）；L-06 行 ID 重複；L-07 50／51 行；L-08 假的時間 ID（新建、修改、只在版本裡）；L-09 拿掉時間行時行還指著它；L-10 舊格式的換順序、改內容、永久刪除；L-11 永久刪除中、滿 50 行、事件 `blockId` 帶 HTML。
- 03 審查（P1-1）卡片的超連結 `links`：規則 `linksOk` 在卡片新建、卡片修改（`links` 有變）時檢查：是陣列、最多 10 個（`store-map.js` 的 `LNK_MAX`）、每個是 map 而且 `color` 是 `#rrggbb`。畫面把顏色放進 `style="--c:…"`，`esc` 擋不住「`red;position:fixed;background:url(外部)`」這種用分號接新宣告的字串（可以把連結蓋滿畫面、載入外部圖片）；規則沒有迴圈，用固定索引逐個檢查（10 個；元素不是 map、沒有 `color`、不是字串時直接出錯＝拒絕，不另外寫型別檢查，省運算式），滿 10 個超連結＋50 行＋時間事件同一批可以寫（L-12）。遷移匯入（`importCreate`）最吃運算式：模擬器實測固定索引 18 個仍可寫、22 個超過上限（`migrate.test.js` 的 03 審查 P2-2 匯入 10 個超連結＋50 行＋時間標記）；第一版每個索引多寫 `is map`／`is string`，匯入 10 個超連結就超過上限，已改短。沒改超連結的修改、換順序、永久刪除不檢查（舊卡片照常能存，L-14）。L-12 10／11 個；L-13 顏色注入（分號接宣告、`url()`、不是 `#rrggbb`、不是字串、沒有 `color`、不是 map，放第 1 個或第 10 個，新建與修改）；L-14 舊卡片已經超過或格式不合。
- 已知限制（03 審查）：
  - 議題的 `links` 與 `markers[].color`、註記位置 `markers[].at` 規則不檢查（議題的規則沒有逐個欄位的形狀檢查，加上要另外一組固定索引）。畫面組 HTML 時一律經過 `util.js` 的 `cssColor`／`cssNum`（只收 `#rrggbb`／有限的數字，不合格用預設值），讀進來時 `store-map.js` 的 `toState` 與 `state.js` 的 `normalize` 也清一次；有部門角色的人用 SDK 寫進不合格的值，只會在畫面上變成預設色。
  - `blocks` 只檢查形狀、不檢查語意（例如核取行的 `check` 跟 `time` 的搭配、同一個時間事件被兩行指到、時間行的文字跟事件名稱不同）：前端讀進來時 `store-map.js` 的 `cleanBlocks` 會修正（第二個指到同一事件的行、指到不存在事件的行改成沒有時間；有時間的行一定是核取），存回時是修正後的內容。

### 5.1g 02D D-d 議題、週報、標籤的刪除（`backend/tests/rules-02d-delete.test.js`）

使用者 2026-11-16 決定：部門管理員可以刪除自己部門的議題、週報、標籤；部門編輯者不行；總管理員照舊可以。刪除必須由規則強制在同一批寫一筆稽核紀錄（誰、何時、類型、標題），做法比照卡片刪除紀錄（第 5.1c 節）。

- **誰能刪**：`isAdmin(deptId) || isSuper()`。編輯者、別部門管理員（含秘書處）、沒有角色的登入者、未登入一律拒絕。
- **刪除紀錄**：`auditLogs/{集合}_{ID}_delete_{被刪那一版 updatedAt 的毫秒}`，欄位沿用稽核紀錄的白名單：`col`＝`issues`／`weeks`／`labels`、`docId`、`rev`（議題的 rev；週報、標籤沒有 rev＝0）、`action: 'delete'`、`actor`＝自己、`at`＝伺服器時間、`before: {title, deptId}`（標題＝議題 `title`、週報 `date`、標籤 `name`）、`after: {}`、`ref: ''`。
- **怎麼強制**：文件的 `delete` 規則要求紀錄批次前不存在、批次後存在（`delLogged`）；紀錄的 `create` 規則要求被刪的文件批次後不存在、內容等於批次前那份文件、ID 的毫秒等於它的 `updatedAt`（`deleteOk`）。跟卡片不同的地方：卡片刪除分很多批，所以先在卡片上記一個亂數（`purgeLog`）；議題、週報、標籤是一次刪掉，紀錄 ID 直接由被刪的那一版決定，效果一樣——不能略過、不能拿舊紀錄充數（同一個 ID 刪掉又重建，`updatedAt` 是新的伺服器時間），也不能沒刪文件就寫紀錄。
- **總管理員也要寫紀錄**（02D 前總管理員可以直接刪，現在跟管理員走同一條路）。例外：遷移失敗回復（`rollbackImport`）刪「這個批次匯入、匯入後沒被改過、批次是 `rollingBack`」的文件不另寫紀錄，批次本身有稽核鏈（`importRollback`；沒被改過＝議題 `rev` 還是 1、週報與標籤的 `updatedBy` 還是開始批次的人，跟 `run.js` 的 `rollbackImport` 同一個條件）。新建時帶 `importBatch` 只能走遷移（`importTagOk`），編輯者不能把自己的文件標成「匯入的」再借回復路徑刪掉（02D 審查 P2-2）。
- **毫秒取整數**：正式專案的伺服器時間到微秒，SDK 的 `toMillis()` 會帶小數、規則的 `toMillis()` 是整數，所以前端用 `Math.floor`（02D 審查 P1-1；模擬器只到毫秒，測試另外放一份有微秒的文件）。
- **沒有 `updatedAt` 的文件**（只可能是在主控台手動放的；網頁、遷移寫入一律有）刪不掉（紀錄 ID 算不出來），要在主控台刪。
- **讀紀錄**：只有總管理員（「會長室管理 → 紀錄」顯示「刪除議題／週報／標籤 標題 · 部門」；firestore 模式的編輯紀錄與會長室各部門編輯量也算進去，`store.js` 的 `fsAuditDept`）。改、刪：任何人都不行。
- **讀取次數**：刪除 6（角色 2～4、紀錄 `exists`＋`existsAfter` 2）＋紀錄 6（文件批次前 1、批次後 1、角色 2～4）＝最多 12；前端一批只裝一個刪除（`store-write.js` 的 `COST.delLogged`）。
- **前端**：firestore 模式的刪除鈕（議題卡片、完成紀錄、週報、標籤設定）只給部門管理員與總管理員（`store.js` 的 `fsDelOk`＝`fsAdmin`）；github 模式不變。

| # | 情境 | 預期 |
|---|---|---|
| X-01 | 部門管理員刪自己部門的議題、週報、標籤（同批寫紀錄） | 允許；紀錄有誰、伺服器時間、類型、標題、部門；總管理員讀得到、管理員讀不到 |
| X-02 | 總管理員刪別部門的（同批寫紀錄） | 允許 |
| X-03 | 部門編輯者刪自己部門的（有寫紀錄也一樣） | 拒絕 |
| X-04 | 別部門管理員、秘書處、沒有角色的登入者、未登入 | 拒絕 |
| X-05 | 刪了不寫紀錄（管理員、總管理員）；紀錄寫到別份文件、舊的毫秒、少了毫秒、別的集合名 | 拒絕 |
| X-06 | 紀錄內容不符：標題、部門、rev、actor 寫別人、用戶端時間、action、col、docId、after、ref、白名單外欄位 | 拒絕 |
| X-07 | 沒刪文件卻寫紀錄（文件還在、文件不存在）；事後改、刪紀錄（含總管理員） | 拒絕 |
| X-08 | 同一個 ID 刪掉又重建再刪：只刪不寫、覆寫舊紀錄 | 拒絕；寫新紀錄允許，兩筆都在 |
| X-09（審查 P1-1） | 被刪的文件 `updatedAt` 有微秒：紀錄 ID 帶小數 | 拒絕；整數毫秒允許 |
| X-10（審查 P2-2） | 編輯者、管理員新建時帶 `importBatch`；回復路徑刪被改過的（議題 rev 2、週報／標籤最後寫入者是別人）、批次不是 `rollingBack` 的、非總管理員 | 拒絕；總管理員在 running 批次匯入、刪沒被改過的允許 |

網頁測試：`fw1.js` 第 3b 段（管理員從畫面刪議題、週報、標籤 → 文件不在、紀錄內容正確；`updatedAt` 有微秒的標籤也刪得掉；編輯者看不到刪除鈕、繞過畫面直接寫刪除＋紀錄被規則拒絕）。

### 5.1h 03 F3 專員名單（`backend/tests/rules-03-roster.test.js`）

使用者 2026-11-17 決定：同部門有角色的成員可以互相看到顯示名稱，選專員時列出同部門全部有角色的人；只開放名稱，不開放信箱與其他欄位。

- **做法**：`roles` 文件不能只開放部分欄位（裡面有 `super`、其他部門、`lastRef`＝邀請雜湊），所以另外一份 `deptMembers/{部門}__{uid}`，只有 `deptId`、`uid`、`at`；名字照舊讀 `profiles`（02A 起任何登入者都能讀 `profiles` 的名字，這次沒有改）。資料欄位見 [data-model.md](data-model.md)。
- **讀**：`isSuper() || isEditor(deptId)`，查詢要帶 `deptId ==`。別部門的成員、沒有角色的登入者、未登入、撤權後的人都讀不到；名單上的人照舊讀不到別人的 `users`（信箱）與 `roles`。
- **建立**：本人或總管理員，而且那個人批次後的 `roles` 真的有這個部門的編輯者或管理員；欄位只能是 `deptId`、`uid`、`at`（伺服器時間），ID＝`{deptId}__{uid}`。不能改。
- **刪除**：總管理員、本人、或同部門的人刪「已經沒有這個部門角色」的那份。
- **畫面**：部門的編輯者、管理員選專員時＝已標的＋自己＋名單上的人（`team.js` 的 `staffPplLoad`）；總管理員照舊用 `roles`（也看得到信箱）。

| # | 情境 | 預期 |
|---|---|---|
| M-01 | 本人登記自己有角色的部門；總管理員替有角色的人登記 | 允許；文件只有三個欄位 |
| M-02 | 同部門的編輯者、管理員、總管理員列名單 | 允許；只有 deptId、uid、at；照舊讀不到別人的 users、roles |
| M-03 | 別部門的成員、沒有角色的登入者、未登入：列、單筆、不帶條件；有角色的人不帶部門條件列全部 | 拒絕 |
| M-04 | 替別人登記（非總管理員）、登記自己沒有的部門、沒有角色的人、未登入、總管理員替沒有角色的人登記 | 拒絕 |
| M-05 | 多帶欄位（信箱、角色、名字）、用戶端時間、ID 跟內容不符、不存在的部門；改既有的 | 拒絕 |
| M-06 | 刪除：同部門刪還有角色的人、別部門、沒有角色的人 | 拒絕；本人、總管理員、同部門刪已撤權的允許 |
| M-07 | 撤權後讀原本部門的名單 | 拒絕 |

網頁測試：`tools/tests/dv1.js`（登入補名單、編輯者的專員選項、別部門與沒有角色的人讀不到、撤權後對齊、打開人員清掉過期的）。

### 5.2 時間事件

```
match /events/{id} {
  allow get, list: if resource.data.visibility == 'public' || internalReader();   // 02A：拿掉 cardDeleted（D14 取消）
  allow create: if isEditor(request.resource.data.deptId) && eventShape() && scopeOk() && visOk() && stampedRev1();
  allow update: if eventShape() && unchanged(['deptId']) && stamped() && revNext() && (
         (isEditor(resource.data.deptId) && scopeOk() && visOk())
      || (isEditor('events')      && onlyChanged(['scope', 'rev', 'updatedAt', 'updatedBy'])
                                  && request.resource.data.scope in ['dept', 'all-activity'])
      || (isEditor('secretariat') && onlyChanged(['scope', 'rev', 'updatedAt', 'updatedBy'])
                                  && request.resource.data.scope in ['dept', 'all-meeting'])
      || meetingEditOfReportedCard() );
  function scopeOk() { return request.resource.data.scope == (resource == null ? 'dept' : resource.data.scope)
                           || request.resource.data.scope == 'dept'
                           || (request.resource.data.scope == 'all-activity' && isEditor('events'))
                           || (request.resource.data.scope == 'all-meeting'  && isEditor('secretariat'))
                           || isSuper(); }
  function visOk()   { return request.resource.data.visibility == 'internal'
                           || ((isEditor('events') || isSuper()) && publicShape()); }   // D4
  allow delete: if isSuper() || withCard();   // 02A：屬於卡片的事件隨永久刪除，或同批從卡片 timeIds 拿掉
}
```

02A：屬於卡片的時間事件建立時必須列在批次後母卡片的 `timeIds`、跟卡片同部門、卡片是 `open`／`done`；`cardId` 建立後不能改（`cardOk`）。這是永久刪除能確認「全部刪光」的前提。

`publicShape()` 限制公開事件只能有 `deptId、title、summary、start、end、allDay、place、scope、visibility、rev、updatedAt、updatedBy`，避免卡片內文跟著公開。

### 5.3 其他

| 集合 | 規則重點 |
|---|---|
| `deptSettings` | `isAdmin(deptId) \|\| isSuper()`；`rev` 加 1 |
| `issues`、`weeks`、`labels` | 同卡片的部門檢查、`deptId` 不能改、`stamped()`；不產生版本；刪除見第 5.1f 節 |
| `users/{uid}` | `uid == me()`；`email == request.auth.token.email`；之後只能改 `lastLoginAt` |
| `profiles/{uid}` | `uid == me()`；`displayName` 是 1～40 字的字串 |
| `grants/meetingEdit` | 只有 `isSuper()`；`until` 不超過現在＋7 天；`rev` 加 1 且要有稽核紀錄（見 [invitations-roles-audit.md](invitations-roles-audit.md) 第 3 節） |
| `meetingMinutes`、`attendance*` | `isEditor('secretariat') \|\| isSuper()` |
| 其他沒列到的路徑 | 預設拒絕：`match /{document=**} { allow read, write: if false; }` |

## 6. 規則做不到、需要 Cloud Functions（Blaze）或人工的事

| 需求 | Spark＋規則的做法 | 要 Functions 才能做到的 |
|---|---|---|
| 寄信或推播通知（申請送出、預約核准） | 不做；登入後在畫面上看到待辦 | 觸發器寄信／推播 |
| 過期資料清理（過期邀請、逾時未審的預約） | 規則把過期的當作無效；畫面不顯示；總管理員手動清 | 排程清理 |
| 排程備份 | 總管理員在瀏覽器手動「匯出全部資料」 | 受管匯出需要啟用計費〔文件〕 |
| 跨大量文件的統計 | 前端查詢後自己算 | 計數器觸發器 |
| 雙人覆核（例如授予 `super` 要兩位總管理員同意） | 不做；靠稽核紀錄事後檢查 | 可用 Functions 檢查 |
| 依 IP 限流 | 不做；靠 App Check（D7）與 Spark 額度上限 | |

結論：01A 範圍內沒有「非 Functions 不可」的需求。上表左欄的取捨要請你確認（決策 D8）。
