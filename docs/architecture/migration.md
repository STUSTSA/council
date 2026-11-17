# 遷移計畫

延續階段 00 第 6 節，補上完整欄位對照、匯入的規則路徑、舊身分對照與凍結方式。原則不變：遷移程式**只讀** `data*.json`、`archive/`，永遠不寫；演練只在模擬器；正式遷移每個部門都要你確認。

## 1. 欄位對照（涵蓋現有 10 個資料檔出現過的每一個欄位）

欄位清單是 01A 用唯讀腳本掃過全部資料檔得到的（schemaVersion 13）。

### 1.1 檔案層級

| 舊欄位 | 去處 | 備註 |
|---|---|---|
| `schemaVersion`、`v` | 不搬；記進 `migrations/{batch}.report` | 匯入前先用現有 `migrate`／`normalize` 升到 13 |
| `id` | 不搬 | 看板 ID，新架構用部門代號 |
| `title` | `deptSettings/{dept}.title` | |
| `range.start`、`range.end` | `deptSettings/{dept}.range` | |
| `reportBase.date`、`reportBase.issues` | `deptSettings/{dept}.reportBase` | `issues` 裡的議題 ID 改新 ID |
| `semester`、`termStart`、`yearLabel` | `org/config`（取秘書處檔） | 其他部門檔的值不同時列進報告 |
| `follows[]`（`id, dept, kind, ref`） | `deptSettings/president.follows` | `ref` 改成 `{dept}__{ref}` |
| `docs[]`（`id, name, url`） | `deptSettings/{dept}.docs` | |
| `meetGrant`（`date, by, at`） | `grants/meetingEdit`（`until`、`by`、`at`） | `until` 的換算方式 01B 依 `meeting.js` 的 `mtGrant` 確認；`by` 是舊名字字串 |
| `minutes[]` | `meetingMinutes/{date}` | 結構原樣；`by` 是舊名字陣列 |
| `members[]`（`id, name, role, createdAt`） | `legacyIdentities/{dept}__{id}` | **`kdf`、`tok` 不搬** |
| `sync.*`（`owner, repo, branch, path, resetAt, tokenAll, tokenEnc`） | **不搬** | 加密權杖不進新資料庫 |
| `pwKdf` | **不搬** | 部門共用密碼雜湊 |
| `locked` | 不搬 | 只是畫面的唯讀開關 |
| `savedAt`、`savedBy` | 記進報告 | |

### 1.2 即時回報 `events[]` → `cards/{dept}__{id}`

| 舊欄位 | 新欄位 | 轉換 |
|---|---|---|
| `id` | 文件 ID 的後半 | |
| `name` | `title` | |
| `desc` | `blocks` ＋ `legacyDesc` | 依 `\n` 切行；每行 `{id: '{卡片ID}_L{序號}', text, check: null, timeId: null}`；空白行保留成空字串；`legacyDesc` 存原文 |
| `issueId` | `issueId` | 改 `{dept}__{issueId}`；找不到的保留原值並列進報告 |
| `staff[]`（舊身分 ID） | `staff[]` | 改 `legacy:{dept}__{id}` |
| `labels[]` | `labels[]` | 改新 ID |
| `links[]` | `links[]` | 原樣 |
| `report` | `report` | |
| `times[]` | `timeIds[]` ＋ `events` 集合 | 見 1.3 |
| `createdAt` | `createdAt` | 字串依 `Asia/Taipei` 轉 Timestamp；`createdBy` 寫 `legacy:import` |
| `doneAt` | `doneAt` ＋ `state` | 有值＝`done`，否則 `open` |
| `fromEv` | `fromEv` | 改新 ID；這 12 筆舊分段紀錄原樣保留，不轉成版本 |
| `round`、`roundAt`、`touched`、`touchedAt` | 同名 | 原樣 |
| （陣列順序） | `order` | 以原本在陣列中的位置 ×1000 |
| | `version: 1`、`importBatch` | 同時建立 `cards/{id}/versions/1`（`imported: true`；01A-R 改成子集合） |

### 1.3 時間標記 `events[].times[]` → `events/{dept}__{timeId}`

| 舊欄位 | 新欄位 | 轉換 |
|---|---|---|
| `id` | 文件 ID 的後半 | |
| `label` | `label` | |
| `start`、`end` | `start`、`end` ＋ `startRaw`、`endRaw` ＋ `allDay` | 只有日期（`YYYY-MM-DD`）＝全天；有時間（`YYYY-MM-DDTHH:MM` 或空白分隔）依 `Asia/Taipei` 轉換；`end` 空白時等於 `start` |
| `place` | `place` | |
| `toIssue` | `toIssue` | |
| （所屬卡片） | `cardId`、`blockId: null` | 不猜它屬於哪一行 |
| | `scope: 'dept'`、`visibility: 'internal'` | 舊資料沒有全會與公開的概念 |

### 1.4 其他陣列

| 舊 | 新 | 備註 |
|---|---|---|
| `issues[]`（`id, title, cur, start, end, note, tags, labels, links, staff, doneAt, markers[]`） | `issues/{dept}__{id}` | `markers[]`（`id, at, date, pos, stage, text, evId, tmId`）原樣嵌入，`evId`、`tmId` 改新 ID；`staff` 同卡片 |
| `weeks[]`（`id, date, text, auto`） | `weeks/{dept}__{id}` | |
| `labels[]`（`id, kind, name`） | `labels/{dept}__{id}` | |

### 1.5 部門本身

`dept/config.js` 的 `BOARD_DEPTS` → `departments/{id}`（`name`、`order`、外觀）。`test: true` 的水果部 `active: false`。

## 2. 預期筆數（驗收用，來自階段 00 第 1.3 節）

| 項目 | 數量 |
|---|---|
| `cards` | 50（權益部 42、活動部 7、社務部 1） |
| `cards/*/versions`（collection group） | 50 |
| `issues` | 4 |
| `weeks` | 11 |
| `labels` | 1 |
| `events`（時間標記） | 16 |
| 議題註記（嵌在 `issues`） | 11 |
| `legacyIdentities` | 11 |
| `departments`、`deptSettings` | 各 10 |
| 多行說明需逐筆還原比對 | 20 筆（權益部） |

正式遷移時以當下 commit 的實際數量為準，報告列出跟上表的差異。

## 3. 匯入方式與規則路徑

- **不產生服務帳戶金鑰**。正式匯入做成「總管理員登入後在瀏覽器執行的匯入頁」，走同一套規則。
- 匯入需要寫入帶舊時間的 `createdAt`、`createdBy: 'legacy:import'`，正常規則不允許。所以每個看板集合的規則多一個分支〔待驗證〕：

```
function importing() {
  return isSuper()
    && request.resource.data.importBatch is string
    && get(doc('migrations', request.resource.data.importBatch)).data.status == 'running';
}
// 例：match /cards/{id} { allow create, update: if importing() || ...一般規則... }
// 版本子集合的匯入分支另外要求 imported == true、version == 1，且同批的卡片也是 importing()（01A-R）
```

- 流程：總管理員建立 `migrations/{batch}`（`status: 'running'`，有稽核）→ 匯入 → 驗證 → 改成 `done`（之後這個批次號就不能再用來寫入）。
- 一批最多 500 筆寫入〔文件〕；全會約 170 份文件，分 1～3 批。
- 模擬器演練時用測試身分直接跑同一支匯入程式。
- **02D 現況**：命令列（`backend/migrate/cli.js`）只連模擬器。正式匯入＝**網頁匯入頁**（02D D-a）：總管理員在看板 → 設定 → 會長室管理 → 匯入，選部門；網頁讀 GitHub 上 `main` 最新 commit 的資料檔（只讀、不用權杖；本機開發讀網站上的檔案），照 `core/js/migrate-core.js`（命令列 `run.js` 也改成呼叫它，邏輯只有一份）寫進 `dept/config.js` 設定的 Firebase 專案，批次號 `web-{部門}-{毫秒}`，完成後改成 `done`（報告不通過或有衝突＝`failed`）並顯示筆數報告。凍結中的部門的設定頁也有 Google 登入，總管理員從那裡進會長室管理。測試：`tools/tests/im1.js`。

## 4. 舊身分對照（決定 A4）

- 11 個舊身分搬成 `legacyIdentities/{dept}__{id}`：`name`、`oldRole`、`createdAt`，`claimedBy: null`。
- **舊身分不會自動得到任何權限。**卡片與議題上的負責人顯示成舊名字（從 `legacyIdentities` 查），跟現在看到的一樣。
- 重新授權有兩條路，都會記錄對照：
  1. **QR 邀請帶 `legacyRef`**：總管理員發邀請時選「這張邀請給舊身分『小芸』」。核銷時同一批寫入 `legacyIdentities.claimedBy = 核銷者 UID`（規則見 [invitations-roles-audit.md](invitations-roles-audit.md) 第 4 節）。
  2. **權限申請帶 `legacyRef`**：使用者登入後申請「我是活動部的舊身分『活動部地精』」，總管理員核准時一起寫入認領。
- 認領後不改寫卡片上的 `legacy:...`；畫面顯示時由 `legacyIdentities.claimedBy` 找到 `profiles` 的新名字。**原始的舊 ID 與名字永遠保留**，可以查到「這張卡片當時標的是誰、後來由哪個帳號認領」。
- 已經有 `claimedBy` 的舊身分不能再被認領（規則 I-27）。認領錯了由總管理員修正（有稽核）。

## 5. 凍結與切換（每個部門）

1. 01B 在 `dept/config.js` 給每個部門一個 `source`：`github`（現狀）｜`frozen`（唯讀，畫面顯示「搬家中，暫停編輯」）｜`firestore`。
2. 切換當天：
   1. 合併一個只把該部門改成 `frozen` 的 PR（你合併）→ 公告暫停編輯。
   2. 記下該部門資料檔目前的 commit SHA 與 SHA-256。
   3. 總管理員執行匯入 → 看報告（筆數、多行還原、連結檢查）。
   4. 該部門的人用 QR 加入、確認看得到也能編輯。
   5. 合併把 `source` 改成 `firestore` 的 PR。
3. 順序與節奏見 [github-token-retirement.md](github-token-retirement.md) 第 2 節第二段。
4. 舊資料檔留在 repo 當唯讀備份，不刪。

02D 起 `firestore` 模式可以編輯：有這個部門角色（編輯者、管理員）或總管理員的 Google 帳號，看板的「儲存」寫進 Firestore（`core/js/store-write.js`，寫法見 [permissions.md](permissions.md) 第 5.1d 節）；沒有角色的人唯讀。網頁的寫入跟遷移共用 `store-map.js` 的欄位對照（`desired` 是 `toState` 的反方向，畫面上沒有的欄位如 `importBatch`、`legacyDesc`、`createdAt` 沿用原文件）。`firestore` 模式不讀寫本機暫存的看板資料，讀取失敗就保持唯讀，不會把空白或舊的畫面存回去。

**02D 實作（逐部門）**：操作手冊在 [`docs/遷移步驟.md`](../遷移步驟.md)。
- 只匯入一個部門：`loadSources({dept})`／命令列 `--dept=代號`。只寫這個部門的文件（`departments` 也只寫它）；`org/config` 跟著秘書處、`grants/meetingEdit` 跟著會長室。重跑同一批：內容相同跳過、少的補上、被改過的列為衝突不覆寫。
- 筆數報告：`deptReport`／命令列 `--dept=代號 --report`。左欄直接從資料檔數（卡片、遷移產生的第 1 版、議題、週報、標籤、時間標記、議題註記、舊身分、多行說明），右欄是 Firestore 裡這個部門的文件，再加上只看這個部門的 V1～V6。任何一列不同或 V1～V6 失敗＝不通過（結束碼 1）。指到還沒匯入的部門的連結（例如會長室追蹤權益部的議題）列出來但不算失敗。只在匯入後、開放編輯前看。
- 讀資料檔複本：`--dir=資料夾`（演練先把資料檔複製過去，只讀複本）；`--commit=SHA` 讀那個 commit 的版本。兩者都不寫資料檔。
- 演練：`tools/tests/sw1.js`（十個部門依順序各做一次匯入 → 報告 → 切換 → 編輯 → 其他部門不變；水果部完整回復），結果見 [verification.md](verification.md) 第 10 節。
- 網頁匯入頁：見第 3 節（02D D-a）。網頁還沒有「回復這一批」「清空這個部門」（README 待辦）。

`frozen` 的好處是凍結不靠資料檔裡的 `locked`（那要寫資料檔），只靠程式設定，所以凍結本身不會碰正式資料。

## 6. 驗證清單

| # | 檢查 |
|---|---|
| V1 | 每個集合、每個部門的來源筆數＝寫入筆數 |
| V2 | 20 筆多行說明：`blocks[].text` 用 `\n` 接回去＝`legacyDesc`＝原始 `desc` |
| V3 | 連結：`issueId`、`markers[].evId／tmId`、`follows[].ref`、`fromEv`、`labels`、`staff` 全部指得到；斷掉的列出，不丟棄 |
| V4 | 時間：每個 `events` 的 `startRaw` 重新解析＝`start`；全天事件的日期在台灣時間沒有偏一天 |
| V5 | 重跑一次：文件數相同、每份文件內容雜湊相同 |
| V6 | 新資料庫裡找不到 `tokenAll`、`tokenEnc`、`tok`、`kdf`、`pwKdf` 任何一個字 |
| V7 | 用「一般登入帳號」與「未登入」各讀一次：一般帳號讀得到看板、讀不到 L2～L4；未登入只讀得到部門名稱與公開活動 |
| V8 | 現有畫面在 `github` 模式下的 Playwright 測試結果跟改動前相同 |
| V9（02D） | 逐部門筆數報告：資料檔直接數＝Firestore 裡這個部門的文件（第 5 節） |
| V10（02D） | 往返：每個部門 Firestore → 匯出成 schemaVersion 13 → 跟原始資料檔語意相同（第 9 節的欄位不比）；命令列 `--roundtrip`、`npm run migrate:roundtrip` |

## 7. 回復

| 時間點 | 回復方式 | 會不會掉資料 |
|---|---|---|
| 切換前 | 不合併或 revert | 不會 |
| 某部門 `frozen` 中、匯入失敗 | 把 `source` 改回 `github`；批次改成 `rollingBack`，用 `rollbackImport` 刪掉那個批次匯入**而且沒被改過**的文件（卡片連同遷移產生的第 1 版、時間事件、議題、週報、標籤），完成後批次改成 `rolledBack`。有稽核鏈的文件（舊身分、部門設定、授權）不刪，重新匯入時內容相同就跳過。重新匯入用新的批次號，文件 ID 是決定性的，不會重複（01B R1，規則與測試見 `backend/`） | 不會，凍結期間沒有人寫；被改過的資料一律保留並列在報告 |
| 模擬器演練 | 直接清空模擬器再匯入（不需要回復流程） | 不會 |
| 某部門已切換、權杖還沒作廢 | **順序固定**（02D 審查修正：先擋寫入才匯出，否則匯出後的修改會遺失）：① 總管理員撤銷這個部門所有人的部門角色（規則每次寫入都讀角色，還開著舊設定的分頁也寫不進去）→ ② 在 `firestore` 模式匯出（看板設定 → 備份 → 匯出備份，記下時間；命令列 `--export=代號 --out=檔名` 只連模擬器）→ ③ `source` 改回 `github` → ④ 確認匯出後沒有新寫入：瀏覽器主控台 `versionsSince(CFG.firebase, 代號, 匯出時間)` 的筆數＋`auditSince` 裡屬於這個部門的筆數都是 0（指令全文見 `docs/遷移步驟.md` 第 4 節第 5 步）→ ⑤ 用看板的「匯入備份」寫回 → ⑥ 角色等再切換時才還（避免舊分頁寫進沒人讀的新資料庫）。02D 實作：匯出跟網頁讀取同一個 `toState`；備份裡沒有的雲端設定與權杖、共用密碼（`sync`、`pwKdf`、`pwHash` 一組，備份裡三個都沒有才整組沿用）、身分的密碼與權杖（每人 `kdf`、`tok` 一組）、會議紀錄，匯入時沿用 GitHub 上原本的值。演練（`sw1.js` B 段，權益部複本＋水果部）：撤權後寫不進去、④ 是 0、寫回的內容＝切換前的資料檔＋切換後的修改、機密欄位沿用原值 | 不會（03 之前結構能一對一對回去）。注意：要在改回 `github` **之前**匯出，改回之後看板就讀資料檔了 |
| 回復後再切換 | 匯入只會新增、相同跳過、不同列成衝突，**不刪多的**：先清掉這個部門在 Firestore 的看板資料（`cards`＋`versions`、`events`、`issues`、`weeks`、`labels`、`deptSettings/{代號}`；保留 `legacyIdentities`、`roles`、`auditLogs`、`departments`）再重新匯入。只匯入沒改過時可用 `rollbackImport`；改過的要總管理員在主控台刪（步驟見 `docs/遷移步驟.md` 第 4.1 節）；正式匯入頁要提供「清空這個部門」（待辦） | 不會：資料檔是最新的；不清的話舊卡片會復活 |
| 權杖已作廢 | 從 Firestore 匯出備份還原到 Firestore；真的要回到 GitHub 寫入，再發一把新權杖 | 不會 |
| 03 上線後退回 JSON | 逐行核取狀態會被攤平成文字 | 失去核取與行層級時間關聯，文字不會掉 |

## 8. 備份（Spark 沒有排程備份）

- 總管理員可用的「匯出全部資料」（**02D D-c 已做**：會長室管理 → 匯出全部資料，`core/js/migrate-web.js` 的 `exportAll`）：一個 JSON 檔 `學生會看板_全部資料_{專案ID}_{日期}.json`，內容 `{kind, version, projectId, exportedAt, exportedBy, batches（每個遷移批次的狀態、來源 commit、資料檔雜湊、時間）, unreadable（總管理員也讀不到的集合，例如別人的預約）, counts, collections（每個集合的文件陣列 {id, path, data}，子集合 versions 用 collection group，時間值是 {__ts: 毫秒}）, boards（每個部門轉成 schemaVersion 13 的部門檔，跟看板「匯出備份」、命令列 `--export` 同一個 `toState`）}`。另外看板「匯出備份」仍是逐部門的（有這個部門角色的人；不含角色、稽核、會議紀錄）。測試：`im1.js` 第 6 段。
- 頻率、存放位置、負責人：決策 D11。建議每週一次＋每次部門切換前後各一次，存到學生會公用帳號的雲端硬碟（只有幹部看得到的資料夾）。
- 備份檔包含 L4 資料（角色、稽核），存放位置的存取權要跟總管理員一致。

## 9. 往返與回復比對不比的欄位（02D，`backend/migrate/compare.js`）

「匯出的 JSON 跟原始資料檔相同」是語意比對（同一份 `canon` 給遷移測試、`--roundtrip`、`sw1.js` 用）。不比的欄位都來自第 1 節「不搬」或只屬於特定部門：

| 欄位 | 為什麼不比 |
|---|---|
| `schemaVersion`、`v`、`id`、`locked`、`savedAt`、`savedBy` | 第 1.1 節：不搬或只記進報告 |
| `sync`（含 `tokenAll`、`tokenEnc`、`resetAt`）、`pwKdf`、`pwHash`、`members[].kdf`、`members[].tok` | 不搬（V6）；寫回 GitHub 時沿用原本的值 |
| `minutes` | 搬到 `meetingMinutes`，看板 `firestore` 模式不讀；寫回 GitHub 時沿用原本的值 |
| `yearLabel`、`termStart`、`semester`（秘書處以外） | 匯出的是全會共用的 `org/config`（取自秘書處檔） |
| `meetGrant`、`follows`（會長室以外） | 只有會長室有這兩個功能 |
| 缺值 ⇄ 看板補上的預設值 | 例如 `round` 缺＝1、舊身分角色不是 `admin`＝`member`、`range` 缺＝今天算出的預設範圍（`state.js` 的 `defaultRange`） |
| 週報的順序 | 新資料庫沒有週報順序；依日期＋ID 排序後比 |
