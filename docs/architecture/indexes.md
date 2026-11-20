# 查詢與索引

## 1. 原則

- Firestore 規則不是篩選器：查詢條件必須讓規則能確定「結果每一筆都可讀」，否則整個查詢被拒〔文件〕。所以下表每個查詢都帶著規則需要的條件（例如一般讀者查卡片一定帶 `state in ['open','done']`）。
- 單一欄位的索引 Firestore 會自動建（集合範圍）；下表只列需要手動建的複合索引。模擬器不檢查索引，新增或改查詢時要照第 4 節的判斷規則對照，並在開發專案實際跑一次。01B 寫成 `backend/firestore.indexes.json`。
- 大段文字欄位設成免索引，省索引空間與寫入成本。

## 2. 查詢清單與複合索引

| # | 畫面／用途 | 查詢 | 複合索引 | 規則依據 |
|---|---|---|---|---|
| Q1 | 總覽（未登入） | `departments` where `active == true` order by `order` | `active ASC, order ASC` | L0 |
| Q2 | 總覽、全會行事曆（未登入） | `events` where `visibility == 'public'` and `start >= 月初` and `start < 月底` | `visibility ASC, start ASC` | L0 只開放 `public` |
| Q3 | 部門看板：進行中 | `cards` where `deptId == X` and `state == 'open'` order by `order` | `deptId ASC, state ASC, order ASC` | L1 |
| Q4 | 部門看板：已完成（分頁） | `cards` where `deptId == X` and `state == 'done'` order by `doneAt DESC` limit 20 | `deptId ASC, state ASC, doneAt DESC` | L1 |
| Q5 | 接續未完成的永久刪除（02A 修正：沒有「最近刪除」了） | `cards` where `deptId == X` and `state == 'purging'` | 兩個等號條件，免複合索引（02A 拿掉 `deptId, state, deletedAt` 索引；`events` 的兩個 `cardDeleted` 索引也一起拿掉） | 部門編輯者以上 |
| Q5b | 接續永久刪除時查這張卡片現存的時間事件（02D 審查） | `events` where `cardId == X` | 單一欄位，免複合索引 | L1 |
| Q6 | 秘書處會議報告事項 | `cards` where `report == true` and `state == 'open'` | `report ASC, state ASC, deptId ASC` | L1 |
| Q7 | 母議題底下的卡片 | `cards` where `issueId == X` and `state in ['open','done']` | `issueId ASC, state ASC` | L1 |
| Q8 | 卡片版本歷史 | `cards/X/versions` order by `version DESC`（01A-R 改成子集合） | 單一欄位，免複合索引 | 卡片可讀時（刪除中的卡片只有 L2，用來由新往舊清除） |
| Q9 | 會長室各部門編輯量 | collection group `versions` where `deptId == X` and `at >= 起` order by `at` | collection group：`deptId ASC, at ASC` | 總管理員或該部門編輯者（01A-R） |
| Q9b | 編輯紀錄（02D；2026-11-20 補索引） | collection group `versions` where `deptId == X` order by `at` ＋ `limitToLast(50)`、`endBefore`（由新往舊翻頁） | collection group：`deptId ASC, at DESC`。`limitToLast` 在 SDK 裡會反過來變成 `order by at DESC limit 50` 再倒回來，所以要降冪的索引；原本寫「同一個索引，不用 DESC 索引」是錯的，模擬器不檢查索引所以測試沒抓到，開發專案實測時 `failed-precondition` | 同 Q9 |
| Q10 | 母議題 | `issues` where `deptId == X` order by `order` | `deptId ASC, order ASC` | L1 |
| Q11 | 週報 | `weeks` where `deptId == X` order by `date DESC` | `deptId ASC, date DESC` | L1 |
| Q12 | 本部門行事曆 | `events` where `deptId == X` and `start` 範圍 | `deptId ASC, start ASC` | L1 |
| Q13 | 全會活動／全會會議 | `events` where `scope == S` and `start` 範圍 | `scope ASC, start ASC` | L1 |
| Q14 | 全會行事曆（登入） | `events` where `start` 範圍 | 單一欄位 | L1 |
| Q15 | 標籤 | `labels` where `deptId == X` | 單一欄位 | L1 |
| Q16 | 預約：某人某週忙閒 | `slots` where `ownerId == P` and `idx >= a` and `idx < b` | `ownerId ASC, idx ASC` | L1 |
| Q17 | 預約：開放時段 | `openWindows` where `ownerId == P` and `start` 範圍 | `ownerId ASC, start ASC` | L1 |
| Q18 | 預約：我的申請 | `bookings` where `requester == me` order by `start DESC` | `requester ASC, start DESC` | 本人 |
| Q19 | 預約：待審 | `bookings` where `ownerId == P` and `status == 'pending'` order by `start` | `ownerId ASC, status ASC, start ASC` | 管理者 |
| Q20 | 私人忙碌 | `busyBlocks` where `ownerId == P` and `start` 範圍 | `ownerId ASC, start ASC` | 管理者 |
| Q21 | 角色清單 | `roles` 全部 | 無 | L4 |
| Q22 | 待審申請 | `roleRequests` where `status == 'pending'` order by `createdAt` | `status ASC, createdAt ASC` | L4 |
| Q23 | 我的申請 | `roleRequests` where `uid == me` | 單一欄位 | 本人 |
| Q24 | 邀請清單 | `invitations` where `status == 'active'` order by `expiresAt` | `status ASC, expiresAt ASC` | L4 |
| Q24b | 最近的邀請（02B 系統管理 → QR 邀請，含已使用、已撤銷） | `invitations` order by `createdAt DESC` limit 30 | 單一欄位 | L4 |
| Q25 | 稽核：某人的權限歷史 | `auditLogs` where `col == 'roles'` and `docId == uid` order by `rev DESC` | `col ASC, docId ASC, rev DESC` | L4 |
| Q26 | 稽核：最近紀錄；02D 起也給編輯紀錄與會長室編輯量（`at >= 起` order by `at`） | `auditLogs` order by `at DESC` limit 50 | 單一欄位 | L4 |
| Q27 | 稽核：某人做過什麼 | `auditLogs` where `actor == uid` order by `at DESC` | `actor ASC, at DESC` | L4 |
| Q28 | 點名：某場次 | `attendanceRecords` where `sessionId == S` | 單一欄位 | L3 |
| Q29 | 點名：某人出席紀錄 | `attendanceRecords` where `memberId == M` order by `sessionAt DESC` | `memberId ASC, sessionAt DESC` | L3 |

## 3. 免索引欄位

| 集合 | 欄位 | 原因 |
|---|---|---|
| `cards` | `blocks`、`legacyDesc`、`links`、`touched` | 大段文字或陣列，不拿來查詢 |
| `versions`（collection group） | `blocks`、`times`、`title` | 快照內容 |
| `issues` | `markers`、`note`、`links` | |
| `weeks` | `text` | |
| `meetingMinutes` | `items` | |
| `auditLogs` | `before`、`after` | |

## 4. 前端實際的查詢與索引對照（2026-11-20，開發專案實測編輯紀錄缺索引後逐一核對）

對照的是 `core/js/` 裡每一個 `getDocs`／`onSnapshot`／`query`（`store-firestore.js`、`store-write.js`、`fb-account.js`、`migrate-web.js`；其他模組都經由這四個檔查詢）。判斷規則〔文件〕：只有等號（含 `in`）條件、沒有排序＝單一欄位索引合併，免複合索引；等號＋另一個欄位的範圍或排序＝要複合索引，方向要跟查詢（`limitToLast` 會反向）一致；只有一個欄位的範圍＋同欄位排序＝單一欄位（集合範圍自動建升冪與降冪）；集合群組（collection group）查詢有條件或排序就要集合群組範圍的索引；沒有條件也沒有排序的整個集合或集合群組讀取不用索引。

| 檔案:函式 | 用在哪 | 查詢 | 需要的索引 | `firestore.indexes.json` | 開發專案實測 |
|---|---|---|---|---|---|
| store-firestore `loadDept` | 看板、跨部門讀取 | `cards` deptId ==, state in [open, done] | 等號（in）免複合；有 `deptId, state, order` 也可用 | 有 | 正常（看板讀得到） |
| store-firestore `loadDept` | 同上 | `issues`／`weeks`／`labels`／`events`／`legacyIdentities` deptId == | 單一欄位 | 自動 | 正常 |
| store-firestore `versionsSince` | 會長室編輯量、編輯紀錄的稽核部分、回復檢查 | CG `versions` deptId ==, at >=, order by at | CG `deptId ASC, at ASC` | 有 | 正常 |
| store-firestore `versionsPage` | 設定 → 編輯紀錄 | CG `versions` deptId ==, order by at, endBefore, **limitToLast** | CG `deptId ASC, at DESC` | **缺，這次補** | **failed-precondition** |
| store-firestore `auditSince` | 編輯紀錄、會長室編輯量、回復檢查 | `auditLogs` at >=, order by at | 單一欄位 | 自動 | 正常 |
| store-firestore `eventsByScope`（登入） | 行事曆「活動」「會議」 | `events` scope ==, start >=、<, order by start | `scope ASC, start ASC` | 有 | 還沒測（只有測試部門切換，#81 讓它不查） |
| store-firestore `eventsByScope`（沒登入） | 主頁全會行事曆 | `events` visibility == public, start >=、<, order by start | `visibility ASC, start ASC` | 有 | 還沒測（同上） |
| store-write `resumeUnits` | 接續中斷的永久刪除 | `cards` deptId ==, state == purging | 兩個等號，免複合 | — | 還沒遇到 |
| store-write `resumeUnits` | 同上 | `events` cardId == | 單一欄位 | 自動 | 還沒遇到 |
| store-write `resumeUnits` | 同上 | `cards/{id}/versions` 全部 | 不用 | — | — |
| fb-account `inviteList` | 系統管理 → QR 邀請 | `invitations` order by createdAt DESC limit 30 | 單一欄位（降冪） | 自動 | 還沒測 |
| fb-account `roster` | 專員名單 | `deptMembers` deptId == | 單一欄位 | 自動 | 還沒測 |
| fb-account `rosterSync` | 打開人員 | `deptMembers` uid ==，或整個集合 | 單一欄位／不用 | 自動 | 還沒測 |
| fb-account `requestsMine` | 帳號頁我的申請 | `roleRequests` uid == | 單一欄位 | 自動 | 還沒測 |
| fb-account `requestsPending` | 系統管理 → 申請 | `roleRequests` status == pending, order by createdAt | `status ASC, createdAt ASC` | 有 | 還沒測 |
| fb-account `auditList`（最近） | 系統管理 → 紀錄 | `auditLogs` order by at DESC, startAfter, limit 50 | 單一欄位（降冪） | 自動 | 正常（看得到「建立總管理員」「刪除議題」） |
| fb-account `auditList`（某人做過什麼） | 紀錄 → 選人 | `auditLogs` actor ==, order by at DESC, startAfter, limit 50 | `actor ASC, at DESC` | 有 | 還沒測 |
| fb-account `auditList`（權限歷史）、`auditChain` | 人員 → 權限歷史、檢查連號 | `auditLogs` col ==, docId ==, order by rev DESC | `col ASC, docId ASC, rev DESC` | 有 | 還沒測 |
| fb-account `profiles`／`legacyList`／`rolesList`／`usersList` | 名稱、人員、舊身分 | 整個集合 | 不用 | — | 正常（人員） |
| fb-account `onRoles`／`inviteWatch` | 角色即時監聽、QR 狀態 | 單一文件 | 不用 | — | 正常 |
| migrate-web `io.list`／`listGroup`、`exportAll` | 匯入的驗證、匯出全部資料 | 整個集合；CG `versions` 沒有條件 | 不用 | — | 匯入正常（S-1）；匯出還沒測 |

結論：這次只缺 Q9b 一個。`firestore.indexes.json` 裡目前沒有前端查詢用到的複合索引（保留，給後續階段的設計用，不刪）：`departments (active, order)`、`cards (deptId, state, doneAt DESC)`、`cards (report, state, deptId)`、`cards (issueId, state)`、`issues (deptId, order)`、`weeks (deptId, date DESC)`、`events (deptId, start)`、`invitations (status, expiresAt)`、預約與點名的六個。`cards (deptId, state, order)` 是 `loadDept` 可以用但不一定要用的。

## 5. 待驗證

- 每個查詢在模擬器裡用「最低權限的身分」實際跑一次，確認規則接受、索引存在〔待驗證〕。模擬器不檢查複合索引是否存在〔文件〕，所以索引設定檔要在 02 部署到**開發專案**後，逐一實際查詢確認。
- `state in [...]` 搭配 `order by` 的索引組合以開發專案的錯誤訊息為準〔待驗證〕。
