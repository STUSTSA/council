/* fc2：登出清空離線快取的接線檢查（靜態）。Firestore 的持久化在模擬器與這個測試環境都不開，無法直接驗證 IndexedDB 內容，
   所以只檢查：登出／換帳號會呼叫 clearCache → wipePersistence（terminate → clearIndexedDbPersistence）→ 重新載入；模擬器不啟用持久化。
   真正的行為請在正式網址手動驗：登入看一個部門→登出→開 DevTools Application→IndexedDB，沒有 firestore/ 開頭的資料庫。 */
const fs = require('fs'), assert = require('assert'), r = f => fs.readFileSync(__dirname + '/../../core/js/' + f, 'utf8');
const app = r('fb-app.js'), st = r('store-firestore.js'), acc = r('account.js');
assert(/terminate\(fbs\.db\)[\s\S]*clearIndexedDbPersistence\(fbs\.db\)/.test(app), '先 terminate 再 clear');
assert(/if \(!e\) \{ try \{ db = initializeFirestore/.test(app), '模擬器不開持久化');
assert(/fbs\.persistent !== true\) return false/.test(app), '沒開持久化就不動');
assert(/clearCache = async \(\) => \{ await drop\(""\); return wipePersistence\(\)/.test(st), 'clearCache 兩種快取都清');
assert(/prevUid&&[^\n]*clearCache\(\)\)\.then\(w=>\{if\(w\)location\.reload\(\)\}\)/.test(acc), '登出／換帳號清完重新載入');
console.log('fc2 通過');
