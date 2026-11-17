# 合併預覽（只讀，git merge-tree；main 2db5220）
鏈：#52 determined-ramanujan → #53 cool-ramanujan(01A) → #54 vigilant-gates(01A-R，含已合的 #57 02A) → #61 02B → #62 02D → 03。全部從 701c155 分出，main 之後多 40 個 commit（#56 token-recovery、#58 repo-move-prep、#59 repo-move-urls 都已在 main）。各分支都沒碰 data*.json／archive（對 701c155 diff 為 0），合併後資料檔取 main 版。
## 文字衝突（02D 頂端對 main）
1. docs/交接說明.md：main 特意跳過八十八～九十一（留給改版鏈），但自己用了九十二（權杖恢復）、九十三、九十四（repo 移轉）；分支的九十二（02A）、九十三（02B）、九十四（02D）、九十五（03）跟它重疊 → 合併時分支這四節順延成九十五～九十八，內文、PR 說明、CLAUDE.md 裡引用的節號一起改。#52/#53 起就有文字衝突（八十八前後的插入位置）。
2. CLAUDE.md：網址行。main＝stustsa.github.io/council（repo 移轉）；分支＝舊網址＋「改版中」一行 → 兩者都留：新網址＋改版中那行。從 #54 起。
3. tools/tests/pv1.js：說明與 route。main 加 SITE 環境變數、apiHits；分支加 data-*.json 一律 404 的 route（寫死 linkmasterking\.github\.io\/-\/）→ 留 main 的 SITE 與 apiHits，404 route 改用 SITE 組出的網址。
## 自動合併但要看語意的檔案
- core/js/cloud.js：main 的 pagesRepo（cloudCfg 以網址為準）與 401 tokenRecover 重試＋分支的 storeSource()==="github" 條件，自動合併結果正確（cloudOn 多了 github 條件，firestore 模式不會觸發 tokenRecover）。
- save.js、team.js、index.html、DESIGN.md：自動合併、語法檢查通過；team.js 的 tokenEnc 比對沿用 main。
- 02D 的拆除清單（docs/architecture/legacy-removal.md）在合併 main 後要補：cloud.js 的 pagesRepo、auth.js 的 tokenRecover／dropSharedToken、tools/redirect-page/、tk1/mv1/rd1 測試；cloud.js 行號會變。
- 建議順序：先把 main 合進 #52（或直接合進鏈頂後往下傳），衝突只在上面三個檔案；cloudCfg 以 #58 為準。
## 03 頂端（c9390ae）對 main
- 文字衝突一樣只有三個：docs/交接說明.md、CLAUDE.md、tools/tests/pv1.js（做法同上；03 的九十五節順延成九十八）。
- 03 跟 main 都改過但自動合併的：save.js、team.js、DESIGN.md、交接說明。
- 合併後的版本（scratchpad/mp3，git merge-tree 產生、只在暫存資料夾）語法檢查全過；main 新加的 tk1、mv1、rd1 和 03 的 kp2（63 項，約 7 分鐘）、se1、dl1（22）都通過。
