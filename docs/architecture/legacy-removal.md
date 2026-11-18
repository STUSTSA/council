# 切換完成後要拆除的舊機制清單（02D 工作清單 D6）

- 基準：分支 `claude/phase-02d`，D1～D5 完成後的 HEAD `ffe4273`（2026-11-15；之後的 commit 只改文件）。原本寫在 `3bb4b9d` 上，D7 前依 `git diff -U0 3bb4b9d ffe4273` 逐行換算、並用第 0 節的指令重查過；拆除前仍請用 `git grep -n ... HEAD` 再查一次。
- 這份只列清單，**沒有改 repo 任何檔案**。資料檔（`data.json`、`data-*.json`）只讀過欄位名稱，沒有讀出任何值。
- 前提：10 個部門（含水果部）在 `dept/config.js` 都是 `source: "firestore"`，而且 github-token-retirement.md 第三段 C1～C4 成立、權杖已由使用者作廢。

## 0. 確認指令（每一項的「確認」欄都用這兩個函式）

```bash
cd /home/user/stustsa/council
X=(-- . ':!data*.json' ':!backend/package-lock.json')   # 全部追蹤中的檔案：*.html（含 home.html）、sw.js、core/、dept/、tools/tests/、backend/、docs/、CLAUDE.md、README.md
G(){ git grep -nwE "$1" "${X[@]}"; }    # 字詞：函式、變數、CSS class（-w：連字號算邊界）
F(){ git grep -nF  "$1" "${X[@]}"; }    # 固定字串：localStorage key、網址參數、檔名、介面文字
# 重現本文件的行號：把 "${X[@]}" 前面加 HEAD，例如 git grep -nwE 'pvAuto' HEAD "${X[@]}"
```

表格裡的 `\|` 是 Markdown 表格的跳脫寫法，實際輸入指令時打 `|`（例如 `G 'pvAuto|pvPut'`）。

通過條件（全部適用）：程式（`*.html`、`core/`、`dept/`、`sw.js`）與 `tools/tests/` **零筆**；`backend/` 只允許 `backend/migrate/run.js:16` 的 `SENSITIVE_KEYS` 字串、`backend/migrate/compare.js` 的 `IGNORED` 清單與檔頭說明、`backend/tests/migrate.test.js` 的「匯出沒有 sync／pwKdf／kdf／tok」斷言（遷移與比對仍要用，見第 8 節）；`docs/` 只允許歷史章節（`docs/交接說明.md` 三十四、八十三等已完成的段落、`docs/architecture/*` 的設計紀錄）。`git grep` 只查追蹤中的檔案，`backend/node_modules` 不會被查到。

---

## 1. 要刪除的程式

| # | 檔案:行（HEAD） | 名稱 | 做什麼 | 切換後由誰取代 | 確認 |
|---|---|---|---|---|---|
| 1.1 | `core/js/provision.js` 全檔 1–95 | `ALL_KEY`13、`allRead`14、`tokPrint`15、`allFresh`16、`pvBlank`18、`pvStatus`19–27、`pvPut`28–37、`pvBusy`39、`pvAuto`40–58、`allSub`59、`allPwSet`61–81、`pvReset`83–95 | 全會密碼加密權杖成 `tokenAll`、後台管理員裝置每 10 分鐘自動寫各部門資料檔、重置水果部 | 無，刪除（部門建立＝遷移程式＋`departments` 文件；人員＝QR 邀請） | `G 'ALL_KEY\|allRead\|tokPrint\|allFresh\|pvBlank\|pvStatus\|pvPut\|pvBusy\|pvAuto\|allSub\|allPwSet\|pvReset'`；`F 'workboard:tokenall'`；`F 'provision.js'`。HEAD 的外部引用：`index.html:68`、`boot.js:43`、`nav.js:371–373`、`fs1.js:70`、`td3.js:16` |
| 1.2 | `core/js/auth.js` 全檔 1–63 | `pwHash`3–5、`curPw`6、`sessionPw`8、`hasSubtle`9、`_te/_td`10、`toB64/fromB64`11、`_base`12、`kdfHash`13、`checkPw`14、`setPw`15、`_aes`16、`encToken`17、`decToken`18、`rememberToken`19–23、`sharedKind`26–31、`tokenFromShared`33–37、`unlockShared`38–53、`changePassword`54–63 | 部門共用密碼（`pwKdf`／舊 `pwHash`，預設 0000）、PBKDF2＋AES-GCM 權杖加解密、輸入密碼解出權杖存進 localStorage | Google 登入（`account.js` 的 `acctSignIn`）＋`roles/{uid}`；權杖不再存在 | `G 'pwHash\|curPw\|sessionPw\|hasSubtle\|_te\|_td\|toB64\|fromB64\|_base\|kdfHash\|checkPw\|setPw\|_aes\|encToken\|decToken\|rememberToken\|sharedKind\|tokenFromShared\|unlockShared\|changePassword'`；`F 'auth.js'`。允許：`backend/migrate/run.js:16`（`'pwHash'` 字串） |
| 1.3 | `core/js/team.js` 2–4、9–23、33–197 | `MIN_PW`2、`ME_KEY`3、`meId`/`sharedPwSession`4、`adminCount`9、`REM_KEY`11、`remRead`12、`remClear`13、`kdfPrint`14、`remSave`15、`remLogin`16–23、`needPw`33–39、`kdfMake`40、`kdfCheck`41、`unlockEdit`44–85、`pwProblem`87–92、`askNewPassword`93–100、`ownSharedPw`102–108、`sharedPwFix`110–116、`setSharedPw`118–124、`cloudWarn`126–129、`joinDone`131–137、`createMember`138–150、`teamHTML`153–163、`teamSettings`164–197 | 舊編輯身分（自填名字＋個人密碼 `members[].kdf`）、記住這台裝置、個人密碼加密權杖 `members[].tok`、「身分與專員」設定頁 | 登入＝Google；人員管理＝`account.js` 的 `councilHub`／`peoplePanel`；舊身分＝`legacyIdentities`（QR／申請認領） | `G 'MIN_PW\|ME_KEY\|meId\|sharedPwSession\|adminCount\|REM_KEY\|remRead\|remClear\|kdfPrint\|remSave\|remLogin\|needPw\|kdfMake\|kdfCheck\|unlockEdit\|pwProblem\|askNewPassword\|ownSharedPw\|sharedPwFix\|setSharedPw\|cloudWarn\|joinDone\|createMember\|teamHTML\|teamSettings'`；`F 'workboard:remember:'`；`F 'workboard:me:'`。注意 `sharedPwFix` 在 15 個測試裡被當成要關掉的對話框（見第 3 節） |
| 1.4 | `core/js/team.js` 209–295 | `baseline`210、`setBaseline`211、`diffState`212–285、`commitMessage`287–295 | 存檔前後比對，組成「〔名字〕類別｜內容」的 commit 訊息（GitHub 編輯紀錄、編輯量的來源） | 卡片 `versions`＋`auditLogs`（D1 寫入時產生，D3 讀取）。D3 沒有用 `diffState`（編輯紀錄直接列版本與稽核紀錄），切換完成後刪 | `G 'baseline\|setBaseline\|diffState\|commitMessage'`。外部引用：`cloud.js:37,54,58`、`meeting.js:112`、`boot.js:32`。`docs/預覽/*.html` 的 `baseline` 是 CSS 對齊用字，跟這個無關（可忽略） |
| 1.5 | `core/js/team.js` 298–333 | `logState`298、`parseCommit`299–306、`logItemHTML`307–311、`renderLog`312–319、`loadLog`320–333 | 編輯紀錄頁：讀 GitHub commits API 並解析訊息 | D3 已做：`loadLog` 在 firestore 模式交給 `fsLoadLog`（`team.js:348–359`，連同 `fsLog`、`FS_FIELD`、`fsLogLine`、`fsLogItems` 334–347，**保留**）。切換後刪 `parseCommit` 與 `loadLog` 裡 GitHub 那一段（323–332），`loadLog` 只剩呼叫 `fsLoadLog`；`logState`、`renderLog`、`logItemHTML` 保留（`old` 分支「舊版存檔」可刪）。畫面外框見 2.6 | `G 'logState\|parseCommit\|logItemHTML\|renderLog\|loadLog\|fsLoadLog'`；`F 'api.github.com'` |
| 1.6 | `core/js/cloud.js` 全檔 1–66 | `TOKEN_KEY`3、`cloudCfg`4–8、`cloudOn`9、`ghToken`10、`SITE_ADMIN_KEY`15、`siteAdminMark`16、`siteAdmin`17（`?admin`）、`cloud`18、`b64enc`19、`b64dec`20、`apiURL`21、`cloudPull`22–42、`cloudPush`43–63、本機暫存回填 64–66 | GitHub Contents API 讀寫資料檔、權杖讀取、後台管理員記號、60 秒輪詢 | 讀＝`store-firestore.js`；寫＝D1 的 Firestore 寫入；後台管理員＝`roles.super`（會長室管理） | `G 'TOKEN_KEY\|cloudCfg\|cloudOn\|ghToken\|SITE_ADMIN_KEY\|siteAdminMark\|siteAdmin\|b64enc\|b64dec\|apiURL\|cloudPull\|cloudPush'`；`G 'cloud\.(sha\|etag\|status\|last\|pending)'`（用 `git grep -nE`）；`F 'workboard:ghtoken'`；`F 'workboard:siteadmin'`；`F 'has("admin")'`（`siteAdmin` 讀網址參數）；`F 'cloud.js'`。**必須最後刪**：HEAD 有十多個檔案引用 `cloudOn`／`ghToken`（先做第 2 節） |
| 1.7 | `core/js/save.js` 89–110 | `cloudSettings` | 「雲端同步設定」：owner／repo／分支／路徑／貼權杖 | 無，刪除 | `G 'cloudSettings'`（HEAD：`save.js:125`、`nav.js:369`） |
| 1.8 | `core/js/save.js` 112–134 | `prepareSave` | 儲存前沒權杖就要求貼上、把權杖加密進身分與共用密碼 | 無（D1 寫入前只檢查 Google 登入與角色） | `G 'prepareSave'`（HEAD：`save.js:136,144`、`pv1.js:109–110`、`td3.js:43`） |
| 1.9 | `core/js/save.js` 3–7、11–20；`core/js/boot.js` 3–10、47–52；`core/js/util.js` 3–4；`core/js/shell.js` 2；`core/js/events.js` 255 的 `HOSTED?` | `selfDoc`、`artifactNS.publish`、`captureTemplate`／`BODY_SRC`、`HOSTED`、`artifactNS`、`canWrite`、`SHELL_IDS` | 在 claude.ai artifact 裡執行時的發布分支（upgrade-plan §2.3「`HOSTED` 分支」退場） | 無，刪除。跟 Firestore 無關，可以獨立一個 commit 先做 | `G 'HOSTED\|artifactNS\|canWrite\|selfDoc\|BODY_SRC\|captureTemplate\|SHELL_IDS'`；`F 'window.claude'` |
| 1.10 | `core/js/pwa.js` 25–54 | `metaGet`26、`metaSet`27–32、`shareSettings`33–54 | 「分享預覽」：用權杖直接改 `index.html` 的 og／twitter meta | 無；要改預覽文字就發 PR 改 `index.html` 7–19 行 | `G 'metaGet\|metaSet\|shareSettings'`；`F '分享預覽'` |
| 1.11 | `core/js/nav.js` 196、217、322、358–360、366–373、379、387 | `siteAdmin()` 那一列 196；`openSettings` 的 `remLogin` 217；`forgetDevice` 322；`SET_HUBS.device` 358–360；`SET_HUBS.site` 366–373（雲端同步、分享預覽、全會密碼、重置水果部）；`SET_FLOWS.team` 379；`[data-set-login]` 點擊 387 | 設定頁的「網站管理」「這台裝置」「人員」、舊登入鎖頭 | 「帳號」「會長室管理」（`account.js` 的 `ACCT_FLOWS`）。**不確定**：`device` 合併頁 360 行的「安裝成 App」說明要不要搬到 `acctSettingsInner`（firestore 模式現在看不到這段） | `G 'forgetDevice'`；`F 'data-set-login'`；`F '網站管理'`；`F 'setRow("device"'`；`F 'hubRun("這台裝置"'`；`F 'data-set="site"'`、`F 'data-hub="allpw"'`（測試裡的選擇器） |
| 1.12 | `core/js/boot.js` 24–27、30、32、35、38–46 | github 讀檔分支 24–27；`remBoot` 30；`setBaseline()` 32；`if(!cloudOn())remBoot()` 35；雲端區塊 38–46（`cloudPull`、`pvAuto(false)` 43、60 秒 `setInterval` 44、`visibilitychange` 45） | 開頁讀 `CFG.data.path`、記住裝置自動登入、輪詢 GitHub | 讀＝23 行的 `storeFsLoad`。**不確定**：firestore 模式目前沒有重新整理機制（沒有輪詢也沒有 onSnapshot），刪掉輪詢前要決定要不要補 | `G 'remBoot\|cloudPull'`；`F 'CFG.data.path'` |
| 1.13 | `core/js/follow.js` 12–13；`core/js/meeting.js` 15、18–20、64、100–121；`core/js/save.js` 32 | `fwLoad` 的 GitHub API 讀取；`mtLoadAll` 的 GitHub API 讀取（記 sha）；「沒有權杖」提示 64；`mtPushAll` 99–120（秘書處用權杖寫回各部門檔） | 跨部門讀寫資料檔 | 讀＝Firestore 查詢（README 待辦「跨部門讀取改讀 Firestore，02D」）；秘書處寫回＝Firestore 寫入受 `grants/meetingEdit` 規則限制。D1 沒有做秘書處跨部門寫入（permissions.md 第 5.1d 節「不開放」），接上之前不能刪 `mtPushAll` | `G 'mtPushAll'`；`F 'vnd.github'`；`F '沒有權杖'` |
| 1.14 | `core/js/activity.js` 12–16、17–29、34–35 | `actCount`、`actFetch`、`actLoad` 的權杖／`cloudOn` 判斷 | 會長室「各部門編輯量」讀 commits 的 `Board-Log: 1` | D3 已做：`actLoadFs`（`activity.js:47–62`，firestore 模式讀版本歷史＋總管理員的稽核紀錄，**保留**）、`actSet`（43–46，保留）。切換後刪 `actCount`、`actFetch`、`actLoad` 裡 github 那一段（34–40），以及 `actLoadFs` 裡還在 GitHub 的部門改讀 commits 的那一支（59 行 `gh?actFetch(...)`、54 行 `cloudCfg`）；畫圖部分（`renderActivity` 等）保留 | `G 'actCount\|actFetch'`；`F 'Board-Log'`；`F 'gh?actFetch'` |
| 1.15 | `index.html` 53、66、68 | `<script src="core/js/cloud.js">`、`auth.js`、`provision.js` | 載入順序 | 無 | `F 'core/js/cloud.js'`、`F 'core/js/auth.js'`、`F 'core/js/provision.js'`；`sw.js` 沒有寫死檔案清單（快取清單是執行期 `performance.getEntriesByType`，`pwa.js:17`），不用改 |
| 1.16 | `dept/config.js` 20–21、40–41、44–45、64；`core/js/config.js` 12 | `data:{owner,repo,branch,path,page}` 預設與說明；水果部「重置」說明；`source` 的 github 說明；「開通、重置用完整的 BOARD_DEPTS」註解 | GitHub 位置設定 | 刪 `owner/repo/branch/page`。**保留** `BOARD_DEPTS` 每個部門的 `path`（`backend/migrate/run.js:25,36` 讀資料檔要用）；`data.path` 是否還有人用見確認 | `G 'CFG\.data'`（用 `git grep -nE`）；`F 'BOARD_BASE.data'`；`F 'pvReset'` |

## 2. 保留但要簡化

| # | 檔案:行 | 名稱 | 現在 | 簡化成 | 確認 |
|---|---|---|---|---|---|
| 2.1 | `core/js/team.js` 5–7、24、26–31 | `meMember`、`meName`、`isAdmin`、`loggedIn`、`ensureLogin` | 依舊身分 `meId` | 改成讀 `acct`：`loggedIn`＝`!!acct.user`；`meName`＝`acct.names[uid] \|\| acct.user.name`；`isAdmin`＝`acctDepts()[CFG.deptId]==="admin"||acctSuper()`；`ensureLogin`＝沒登入就 `acctSignIn()`。D1 已在原函式裡加了 firestore 分支（`meName`＝`acctName()`、`loggedIn`＝`fsWriter()`，`team.js:7`、`24`），切換後只拿掉舊身分那一半，不要另做一份 | 呼叫端（HEAD）：`events.js:43`、`meeting.js:95,96,101,134`、`render.js:31,39`、`nav.js:184,217,390`、`labels.js:33`、`report.js:60`、`save.js:29,138,146`、`views.js:5`。`G 'meMember\|meName\|isAdmin\|loggedIn\|ensureLogin'` 每筆都要指向新實作 |
| 2.2 | `core/js/team.js` 199–207 | `staffOpts`、`staffNames`、`staffHTML`、`staffField` | 專員＝`state.members` | 保留（firestore 模式 `state.members` 由 `store-map.js:140` 從 `legacyIdentities` 產生，沒有 kdf／tok）。檔案只剩這段與 2.6 時，可考慮改名，但改名要同步 `index.html:67`，**不確定**值不值得 | `G 'staffOpts\|staffNames\|staffHTML\|staffField'` |
| 2.3 | `core/js/save.js` 8–27、28–33、135–140、142–148 | `persist`、`save`、`saveFlow`、`settingSave` | `persist` 有 artifact／GitHub／本機三條路；`saveFlow`／`settingSave` 先 `prepareSave`；`saveFlow` 有共用密碼太短提示 122–125；`save` 寫 `savedBy=meName()` 並呼叫 `mtPushAll` | `persist`＝`storeLocked` 檢查＋D1 的 Firestore 寫入，失敗保留畫面修改；拿掉 20–25；`saveFlow` 只剩 `morph(()=>save())`；`settingSave` 拿掉 130 | `G 'persist\|saveFlow\|settingSave'`；`F '已存在這台電腦'`；`F '已儲存並定型'`（不要查「只存在這台裝置」：`notify.js:110` 的整理功能說明也有這幾個字） |
| 2.4 | `core/js/save.js` 46–79 | `exportBackup` | 有 HOSTED 下載分支 38–41 | 保留（D2 回復路徑、migration.md 第 8 節備份），只刪 HOSTED 下載分支。02D 加的 `if(fsMode())delete s.minutes`（`save.js:48`）等會議紀錄也搬到 Firestore 時再決定 | `G 'exportBackup'` |
| 2.5 | `core/js/store.js` 1–20；`core/js/config.js` 15；`dept/config.js` 58；`core/js/account.js` 16 | `STORE_SOURCES`、`deptSourceOf`、`storeLocked`、`boardLocked`、`STORE_NOTE`、預設 `source:"github"`、`acctOn` | 三種來源，預設 github | 預設改 `firestore`；拿掉 `"github"`；`storeLocked`＝`=== "frozen"`；`STORE_NOTE.firestore`（「目前只能檢視」）D1 之後仍給沒有角色的人用，保留；`acctOn`＝`FB_ON`。**不確定**：`frozen` 要不要留給以後的維護凍結（建議留，成本很低）；`boardLocked` 的 `state.locked`（舊「定型版」，遷移不搬）可刪，但匯入舊備份時 `events.js:244` 已經把它設成 false | `F '"github"'`；`G 'deptSourceOf\|storeSource\|storeLocked\|boardLocked\|STORE_NOTE\|acctOn'`；`F 'source: "github"'` |
| 2.6 | `core/js/team.js` 361–381；`core/js/back.js` 40；`core/js/nav.js` 378、287 | `openLog`、`closeLog`、`logDone`、Esc 監聽 352、`Back.layers.log` | 編輯紀錄頁外框 | D3 沿用這個畫面（只換資料，1.5）：**保留**，第 4 節 CSS 也保留 | `G 'openLog\|closeLog\|logDone'`；`F 'logOv'` |
| 2.7 | `core/js/render.js` 31、33、39、48 | `canEdit`、`editBarHTML`、`startEdit` | `loggedIn()`；按鈕字「儲存並同步」看 `cloudOn()` | `canEdit`＝有這個部門的角色且不唯讀；按鈕一律「儲存」；`startEdit` 用 2.1 的 `ensureLogin` | `F '儲存並同步'`；`G 'canEdit'` |
| 2.8 | `core/js/views.js` 5 | `renderHeader` 的 `#saveInfo` | 雲端狀態、「這台裝置沒有連上雲端」、`localOK` 提示 | 只留「上次儲存／更新於」 | `F '雲端已同步'`；`F '這台裝置沒有連上雲端'`；`G 'localOK'` |
| 2.9 | `core/js/pwa.js` 2、10 | `netFail` 註解、`online` 事件 | 重新連線時 `cloudPull` | 重新連線時重讀 Firestore 或只 `render()` | `F 'addEventListener("online"'` |
| 2.10 | `core/js/boot.js` 22–23、37、54 | `dataReady`、學年讀秘書處、唯讀提示 | 三條路 | 只剩 `storeFsLoad`；`SEEDED`／`file:` 條件在 HOSTED 刪掉後可簡化（**不確定**：`file://` 開本機檔還要不要支援）；37 改走 Firestore 版 `fwLoad` | `G 'SEEDED\|dataReady'` |
| 2.11 | `core/js/follow.js` 1–3、7–18；`core/js/meeting.js` 1–7、11–26、29、95–97；`core/js/notify.js` 5、314 | `fwLoad`、`mtLoadAll`、`mtGrant`、授權開關 | GitHub API 或網站上的資料檔 | 只讀 Firestore（`deptSettings`、`cards` 等，照 indexes.md）；`mtGrant` 讀 `grants/meetingEdit`（**不確定**：`toState` 只在 president 讀 grant，秘書處要另外查）；更新檔頭說明 | `G 'fwLoad\|mtLoadAll\|mtGrant'`；`F 'vnd.github'` |
| 2.12 | `core/js/nav.js` 183–196、390 | `settingsInner`、設定清單點擊 | 183 行 firestore 直接回 `acctSettingsInner`，184–196 是舊登入版清單 | `settingsInner`＝`acctSettingsInner`；390 拿掉 `!ACCT_FLOWS[k]&&!loggedIn()`。**前提**：`acctSettingsInner`（`account.js:98–111`）在 D1／D3 後有每週概述、報告、編輯紀錄、帳號、看板名稱（管理員以上）、標籤、備份（只有匯出）、會長室管理；**學年與開學日**（`org/config` 只有總管理員能寫，還沒接畫面）、**安裝成 App 的說明**還沒有，接上之前刪 184–196 會拿掉這兩項 | `G 'settingsInner\|acctSettingsInner'` |
| 2.13 | `core/js/labels.js` 33；`core/js/report.js` 60；`core/js/meeting.js` 96、134；`core/js/save.js` 29、146 | `isAdmin()`、`meName()`（封面製作人、`meetGrant.by`、`minutes.by`、`savedBy`） | 舊身分 | 走 2.1。D1 後 firestore 模式的 `meName()`＝Google 名稱（`acctName`），不會空白；`meetGrant.by`、`minutes.by` 在 firestore 模式不寫（會議功能沒開放） | 同 2.1 |
| 2.14 | `core/js/state.js` 38–40、53–56、71、73–74 | v10 註解、`termCfg` 註解、`SEEDED` 註解、`KEY`、`localOK` | `KEY` 是 github 模式的本機暫存 | 註解改成現況；`KEY`／`localOK` 在 cloud.js、provision.js、save.js 本機路徑刪掉後若零引用就刪。**不確定**：離線唯讀要不要改用自己的快取（見第 9 節風險） | `G 'KEY\|localOK'` |
| 2.15 | `core/js/events.js` 232–258 | 匯入備份 | 讀 JSON 或舊 HTML 匯出的 `<script id="state">` | 保留（舊備份相容）；拿掉 `HOSTED`。02D 加的「備份裡沒有的 `sync`、`pwKdf`、`pwHash`（一組）、`minutes`、`members[].kdf/tok`（一組）沿用目前的值」（`events.js:240`、`245–253`，給回復到 GitHub 用）切換後刪。firestore 模式目前不開放匯入（`nav.js:357`；`events.js:234` 也擋下）；要開放的話寫入要走 D1 的白名單（store-map 的 `desired`），舊備份裡的 `sync`、`members[].kdf/tok`、`pwKdf` 不能寫進 Firestore | `F 'importFile'` |
| 2.16 | `core/js/icons.js` 2 | `cloud`、`device` 圖示 | 只有 nav.js 196、359、368 用 | 1.11 刪完後零引用就從表裡拿掉。**不確定**：一行的 map，留著也無害 | `git grep -nE "[\"']cloud[\"']\|[\"']device[\"']" "${X[@]}"` |
| 2.17 | `sw.js` 2–6 | 檔頭註解、`NO_CACHE` | 說明 data.json 與 GitHub API | 只改註解；`NO_CACHE` 與 `CACHE="board-cache-v1"` **不要改**（見第 7 節） | — |

## 3. 測試

先改測試骨架、讓功能測試在 firestore 模式通過，再刪舊程式。照 `CLAUDE.md`：只刪「測的是已不存在的規格」的測試，每一個都要記進清理報告。

| # | 檔案 | 處理 | 原因 |
|---|---|---|---|
| 3.1 | `tools/tests/pv1.js` | 刪 | 主題是開通部門（provision.js）與舊登入提示。**不確定**：檔頭說也測「錯誤視窗」（`dialog.js` validate 紅字），刪之前確認 `acc1.js` 或其他測試有涵蓋，沒有的話把那段搬過去 |
| 3.2 | `tools/tests/td3.js` | 刪 | 主題是全會密碼、自動開通、水果部重置 |
| 3.3 | `tools/tests/td2.js` | 刪「記住這台裝置」那一半，留今日層收合 | `remSave`、`remRead`（19–22 行） |
| 3.4 | `tools/tests/v2.js` | 刪記住密碼／自動登入（約 69–88 行，`REM_KEY`），其餘改寫 | 舊身分登入、`kdf` |
| 3.5 | `tools/tests/v2b.js` | 刪「身分與專員」「忘記裝置」（`remSave` 51、`REM_KEY` 54），其餘改寫 | 同上 |
| 3.6 | `tools/tests/sp1.js` | 改寫：鎖頭登入改 Google；編輯紀錄改 D3 來源；拿掉 `siteadmin`／網站管理 | 混了舊登入與 commits |
| 3.7 | `tools/tests/ac1.js` | 改寫成 D3 來源（不刪：編輯量畫面還在） | 模擬 commits 的 `Board-Log` |
| 3.8 | `tools/tests/fs1.js` 66–73 | 刪 github 模式與 `pvPut`／`ghtoken` 那幾條；`frozen` 留不留跟著 2.5 | 測已不存在的路徑 |
| 3.9 | `tools/tests/common.js` 1–16 | 重寫：GitHub API 模擬（7–11）、`serveRemote`、`login`（13–16：ghtoken＋0000＋建立身分）→ 改成 Auth＋Firestore 模擬器、用遷移程式種資料、Google 登入（參考 `acc1.js`） | 所有共用測試都靠它 |
| 3.10 | 用 GitHub 模擬或舊登入的功能測試：`ad1 dl1 ed1 ev1 hd1 ind1 lv1 meet1 mt1 mt2 rp1 sch1 se1 sm1 tm1 wk2`（多數各自寫一份登入，或 stub `sharedPwFix`） | 改寫，不刪 | 功能還在，只是登入與資料來源換了 |
| 3.11 | 不碰舊機制、但靠讀 `data.json` 開頁的：`app1 bk1 cs ds1 fx1 gt1 gt2 hm1 hm2 lg1 lg2 nt1 pe1 rp2 st1` | 只改開頁方式（資料改由模擬器提供）；`cs.js:4` 塞的 `kdf:'x:y'` 拿掉 | github 模式拿掉後頁面不讀 `data.json` |
| 3.12 | `tools/tests/data_test.json`、`data_v5.json` | 保留 | 測 `state.js` 的舊格式遷移與匯入；種進模擬器前要先 `normalize` 成 v13（`backend/migrate/run.js:50` 只收 13） |
| 3.14 | `tools/tests/sw1.js` B 段（水果部回復到 GitHub：`workboard:ghtoken` 假權杖、GitHub API 模擬、匯入備份寫回）；A 段「下一個 github 部門讀資料檔」那一項 | 刪 B 段與 A 段那一項；A 段的逐部門匯入、報告、編輯、其他部門不變保留 | 權杖作廢後回不到 GitHub |
| 3.13 | `backend/tests/*`、`backend/package.json` 14 行 `test:web` | `backend/tests` 不動；`test:web` 加上改寫後的網頁測試 | 遷移與規則測試跟舊機制無關；`migrate.test.js` 的 V6 仍要查敏感欄位 |

確認：`F 'workboard:ghtoken'`、`F 'workboard:remember'`、`F 'workboard:siteadmin'`、`F 'api.github.com'`、`G 'sharedPwFix\|REM_KEY\|remSave\|pvPut\|allPwSet\|prepareSave'` 在 `tools/tests/` 都要零筆；`docs/交接說明.md` 第七節的測試清單同步改。

## 4. CSS（`core/board.css`）

| # | 行 | 選擇器 | 處理 | 確認 |
|---|---|---|---|---|
| 4.1 | 1476–1478 | `.tm-pill`、`.tm-pill.on`、`.tm-act` | 刪（只有 `team.js:155–156` 用） | `G 'tm-pill\|tm-act'` |
| 4.2 | 1818 | `:where(...)` 清單裡的 `.tm-pill:not(.on)` | 只刪這一個項目 | 同上 |
| 4.3 | 1471–1475、1479–1481 | `.tm-sec .tm-list .tm-row .tm-name .tm-tools .tm-note` | **保留**：`labels.js:35–41` 也用 | `G 'tm-sec\|tm-list\|tm-row\|tm-name\|tm-tools\|tm-note'` |
| 4.4 | 1456 | 段標題「身分與專員」 | 保留（下面是 `.staff-*`），標題改成「專員」 | — |
| 4.5 | 1483–1513、51、1818–1819 | `.log-ov` `.log-scroll` `.log-list` `.lg-day` `.lg-date` `.lg-item` `.lg-time` `.lg-main` `.lg-who` `.lg-old` `.lg-lines` `.lg-cat` `.log-more` `.log-msg` `.lg-empty`、`body.log-open`、`:where` 的 `.lg-cat`／`.lg-item:not(.old)` | **保留**（D3 沿用編輯紀錄畫面，`.lg-who` 顯示 Google 名稱）；只有 `.lg-old`「舊版存檔」在刪 `logItemHTML` 的 `old` 分支後可刪 | `G 'log-ov\|log-scroll\|log-list\|lg-day\|lg-date\|lg-item\|lg-time\|lg-main\|lg-who\|lg-old\|lg-lines\|lg-cat\|log-more\|log-msg\|lg-empty\|log-open'` |
| 4.6 | 1165–1172 | `.set-gate`、`.set-gate-ico` | **保留**：`account.js:95–101` 也用 | `G 'set-gate\|set-gate-ico'` |
| 4.7 | 33–37、316 | `body.authed` 規則 | **保留**（`render.js:48` 依 `canEdit()` 切換） | — |
| 注意 | 605–609、631；641–643 | `.lg-tk` `.lg-hint`（甘特圖圖例）；`.log-dot` `.log-d` `.log-p`（議題「處理紀錄」，`views.js:85`） | **不要刪**：名字像編輯紀錄，其實不是 | `G 'lg-tk\|lg-hint\|log-dot\|log-d\|log-p'` |

沒有專門給「網站管理」「雲端同步」「記住裝置」的 CSS（都是共用的 `.set-row`、`.set-hub`）。

## 5. 資料檔裡變成沒有用的欄位（不由我們改；改不改是使用者的決定 8-13）

HEAD 的欄位名稱（只讀名稱，沒讀值）：

| 欄位 | 在哪些檔案 | 以前誰讀 | 拆除後誰還讀 |
|---|---|---|---|
| `sync.tokenAll` | 全部 10 個 | `auth.js` 26–37、`provision.js`、`save.js:116`、`team.js:46` | 沒有程式讀；`backend/migrate/run.js:16` 只用來確認**不搬** |
| `sync.tokenEnc` | `data.json`、`data-events.json` | `auth.js:19–23,33–37,60–61`、`save.js:116,132`、`team.js:122` | 同上 |
| `sync.owner/repo/branch/path` | `data.json`、affairs、finance、fruit、marketing、pr、works | `cloud.js` 的 `cloudCfg`（release-03 起在 `*.github.io` 上以網址為準，只在其他網址會蓋過 `CFG.data`） | 沒有 |
| `sync.resetAt` | `data-fruit.json` | `provision.js:90` 寫 | 沒有 |
| `sync.initial` | 目前沒有檔案有 | `team.js:50,123`、`auth.js:41–42` | 沒有 |
| `pwKdf` | `data.json`、events、president、secretariat | `auth.js:14–15,29,48` | 沒有（不搬） |
| `pwHash` | 目前沒有檔案有 | `auth.js:6,15,29` | 沒有 |
| `members[].kdf`、`members[].tok` | 11 個舊身分，分在 7 個檔（`data.json`2、events2、secretariat2、affairs2、marketing1、pr1、president1） | `team.js`、`save.js:101,131` | 沒有（`legacyIdentities` 只搬 id、name、role、createdAt） |
| `members[]` 其他欄位 | 同上 | 專員顯示 | 遷移已搬進 `legacyIdentities`；資料檔裡的保留當備份 |
| `locked` | `data.json` | `store.js:19` 定型版 | 沒有（遷移不搬）。**不確定**是不是要一起清 |

說明：權杖作廢後 `tokenAll`、`tokenEnc`、`tok` 解得開也沒有用；`pwKdf`、`kdf` 還在 Git 歷史，改寫歷史不實際，照 upgrade-plan §6.7 通知 11 位舊身分改掉其他服務的同一組密碼。要清資料檔是使用者親自確認的一次資料檔修改；`tools/tests/data_test.json`、`data_v5.json` 的 `sync`、`locked` 是測試資料，可以跟測試一起處理。

## 6. 要更新的文件

| 文件:行 | 改什麼 |
|---|---|
| `CLAUDE.md` 8、12、29、38–40 | 「切換完成前仍讀寫 data*.json」改成現況；第 1 條的理由（看板用 GitHub API 寫 main）改成「唯讀備份、遷移來源」；schemaVersion「切換完成前照舊」改成新規則；測試準備（放 `data.json`、route 掉 GitHub API）改成模擬器。**要使用者自己同意才改**（agent 不能自行改 CLAUDE.md） |
| `docs/交接說明.md` 二、三（47、50）、四（55–65 程式結構列了 cloud／auth／team／provision）、五（77）、六「同步與安全」（82–87 整段）、七「測試」（89–105）、十（144–149）、八待辦 | 改成現況；新增這次清理的章節與清理報告（五類各列已移除／保留／發現但沒處理）。歷史章節（三十四、八十三、八十一等）不改 |
| `docs/DESIGN.md` 66、68 | 拿掉「網站管理」「這台裝置」 |
| `docs/DESIGN.md` 173–184「資料來源與暫停編輯」 | 拿掉 github；`frozen` 照 2.5 |
| `docs/DESIGN.md` 204 起「開通部門與登入提示」 | 整節刪除，指向 185「Google 登入與會長室管理」 |
| `docs/upgrade-plan.md` 104–110（§2.3）、316–325（§6.6）、355／383（02D） | 「切換後要退場」標成已完成；「把開關改回 github」那一列標成已不適用 |
| `docs/architecture/github-token-retirement.md` 第三段（47 起）、§3、§4 | 標成已作廢（日期）；§4 每週檢查指令在作廢後可以停 |
| `docs/architecture/migration.md` §5（120–142）、§7（158–168）、§9（175 起） | `source` 只剩 firestore（與 frozen）；回復表裡「改回 github」的列標成作廢後不適用。§1.1 欄位對照不動 |
| `docs/architecture/github-ownership-migration.md` §5（211 起「現有 GitHub 寫入」）、12、59（`sync.owner`） | 標成已不適用 |
| `docs/architecture/README.md` 90（R7）、96（D10）、105、127 | 待辦狀態更新 |
| `docs/遷移步驟.md` 第 4 節（回復）、第 5 節表格最後一列 | D5 已改寫成切換手冊；作廢後「改回 GitHub、匯入備份寫回」標成不適用 |
| 不用改 | `permissions.md`、`invitations-roles-audit.md`、`verification.md` 裡的「權杖」是 QR 邀請權杖，跟 GitHub 權杖無關 |

確認：`F '全會密碼'`、`F '共用密碼'`、`F '個人密碼'`、`F '網站管理'`、`F '雲端同步'`、`F '?admin'` 只剩歷史章節。

## 7. 拆除順序

1. **前提**（全部成立才開工）：10 個部門都是 `firestore`；D1 寫入、D2 匯出、D3 編輯量與編輯紀錄（以上 02D 已在模擬器完成）、瀏覽器匯入頁、跨部門讀取（`fwLoad`、`mtLoadAll`、`notify.js:314`）已接上 Firestore；2.12 列的設定項目在 firestore 模式都有；C1～C4 成立；**使用者已在 GitHub 上作廢權杖**。作廢前先拆程式會讓仍開著的舊分頁沒有退路，作廢後才拆不會掉資料。
2. 測試骨架（3.9～3.11）先改到在現在的程式上通過（firestore 模式），確認舊主題測試（3.1～3.5、3.8）測的是要拆的規格。
3. 各自一個 commit，由葉到根（每步跑一次 0 節的確認）：
   1. HOSTED 分支（1.9）：獨立，任何時候都可以。
   2. `provision.js`（1.1）＋設定頁全會密碼／重置列（1.11 的 371–373）＋`boot.js:43`＋`pv1`、`td3`。
   3. 網站管理（`cloudSettings` 1.7、`shareSettings` 1.10、`siteAdmin`、nav 366–373、196）。
   4. 舊登入與記住裝置：先做 2.1（新的 `meName` 等），再刪 1.3、`auth.js`（1.2）、nav 184–196／217／322／358–360／379／387、boot 30／35。
   5. GitHub 存檔與讀取：2.3、2.7～2.11、1.4、1.5、1.8、1.12～1.14，最後整個 `cloud.js`（1.6）與 `index.html` 三個 script（1.15）。
   6. 來源開關與設定（2.5、1.16、2.14）。
   7. CSS（第 4 節）、圖示（2.16）。
4. 文件（第 6 節）跟最後一個程式 commit 同一個 PR；清理跟功能修改分開 commit，方便單獨 revert。
5. 建議（要先問使用者，屬於新增行為）：開頁時清掉裝置上的舊 key：`workboard:ghtoken`（作廢的權杖明文）、`workboard:tokenall`、`workboard:tokenall:at`、`workboard:siteadmin`、`workboard:remember:*`、`workboard:me:*`；`workboard:board-*`（舊的本機暫存）看 2.14 決定。

## 8. 一定要留的相容部分

- 資料檔 `data*.json` 全部留著（唯讀備份；`backend/migrate` 讀它；`BOARD_DEPTS[].path` 要留）。
- `state.js` 的 `normalize` 與 `MIGRATIONS` 2–12 全部留：匯入舊備份、測試資料（`data_test.json` 沒有 schemaVersion、`data_v5.json` 是 v5）、以及 `RAW_STATE={}` 開頁時也會跑一遍遷移（`state.js:70–72`）。
- `store-map.js` 的白名單與檔頭說明、`backend/migrate/run.js:16` 的 `SENSITIVE_KEYS`、`migrate.test.js` 的 V6：仍要保證敏感欄位不進 Firestore。
- 匯入備份讀舊 HTML 匯出的 `<script id="state">`（`events.js:236`）與 `index.html:39` 的 `#state`。
- 網址：`?d=代號`、`#join=`、`home.html`、`dept/app/*.webmanifest` 都不變；`?admin` 拿掉後只是沒有作用，不會壞。
- `sw.js`：`CACHE` 名稱不要改（改了 activate 會清掉全部離線備份）；`NO_CACHE` 留著。
- `legacyIdentities` 與 `state.members`（專員顯示）。
- `exportBackup`（D2、每週備份）。

## 9. 風險

1. **還開著的舊分頁／舊快取版本**：切換前就打開、一直沒重整的分頁，記憶體裡是 github 模式，權杖還有效時存檔會寫進資料檔（Firestore 看不到）。對策：每個部門先 `frozen`、切換後盡快作廢權杖（C1）。作廢後這種分頁存檔會收到 401，`cloudPush` 回「權杖無效」並只存在本機，使用者可能以為存好了；新版上線後重整即可。`sw.js` 是網路優先，線上重整一定拿新版；離線時才會用到快取的舊版，舊版讀不到資料檔也寫不出去。
2. **測試大量失效**：HEAD 有 35 個以上的 Playwright 測試靠 github 模式（`common.js` 的 GitHub 模擬與 0000 登入）。不先換骨架就刪舊程式，等於整套測試一起壞；`CLAUDE.md` 不允許為了通過而刪測試。
3. **設定項目消失**：`acctSettingsInner` 在 D1／D3 後仍沒有學年與開學日、安裝成 App 說明（2.12）；補上之前刪掉 `settingsInner` 的舊分支，會失去這兩項。
4. **離線唯讀退化**：github 模式把整份資料存在 localStorage（`KEY`），離線還看得到；firestore 模式現在不存。刪 `KEY` 前要決定是否用 Firestore 離線快取或自己的暫存（**不確定**，屬於新增儲存方式，要先問）。
5. **`cloud.js:64–66` 的本機回填**：D1 已處理（只在 `storeSource()==="github"` 時回填；firestore 模式讀取失敗保持唯讀，不會把舊的本機資料存回去）。拆 `cloud.js` 時一起刪。
6. **名字**：D1 後 firestore 模式 `meName()` 是 Google 名稱（2.13），已不會空白。
7. **匯入舊備份**：舊備份帶 `sync`、`kdf`、`tok`、`pwKdf`；firestore 模式目前不開放匯入。之後要開放，寫入必須照 `store-map` 的 `desired` 白名單，否則會把加密權杖與雜湊寫進 Firestore（違反 V6）。
8. **回不去 GitHub 模式**：拆除後要回到 GitHub 寫入，得 revert 清理 PR 並發新權杖。所以清理 PR 要分 commit、作廢與拆除之間至少照 C1 觀察 3 個工作天。
9. **預設來源**：拿掉 `"github"` 時 `deptSourceOf` 的預設一定要改成 `firestore`，不然漏設的部門會掉回不存在的模式。
10. `dept/config.js:32` 現在是開發專案設定，進 main 前要換正式專案（README 既有待辦），跟這次清理無關但會一起被看到。
11. 第 1 節的 `G` 指令對中文介面字要用 `F`；`-w` 對 `_te`、`KEY` 這類短名稱會同時抓到別的檔案的同名字，結果要逐筆看，不要只看筆數。

## 10. release-03（main 合併改版）之後要補的項目

main 在改版鏈之外另外加的過渡機制，切換完成、權杖作廢後跟上面一起拆。**本節沒有行號**：合併後行號都變了，拆除前照第 0 節的指令用 `git grep -n` 重查。
- `core/js/auth.js` 的 `tokenRecover`（權杖作廢後輸入全會密碼恢復）、`dropSharedToken`（不再寫 `sync.tokenEnc`）；`core/js/cloud.js` 的 `cloudPush` 401 分支（呼叫 `tokenRecover` 後重試）。交接說明九十二。
- `core/js/cloud.js` 的 `pagesRepo`（`cloudCfg` 在 github.io 上以網址為準）：GitHub 寫入拆掉後跟 `cloudCfg` 一起拆。交接說明九十三。
- `tools/redirect-page/`（舊網址 `linkmasterking.github.io/-/` 的轉址頁）：放在舊 repo，看使用者什麼時候停用舊網址，跟切換無關。
- 測試：`tk1.js`（權杖恢復）、`mv1.js`（網址判斷 repo）、`rd1.js`（轉址頁）跟著它們測的程式一起拆或改寫。
- `core/js/store-map.js` 的「☑ 」「☐ 」還原（`chkOf`）與 `state.js` 拿掉 `_newer`：是給舊網站（schemaVersion 13）並存期間的防護，所有人都換到新版、資料都在 Firestore 之後可以留著（無害），不必拆。

