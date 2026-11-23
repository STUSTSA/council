/* fc3：設定「強制刷新」的接線檢查（靜態；firestore 模式的網頁在沒有 gstatic 的環境開不起來）：
   設定清單有這一列、點擊會作廢快取並強制重讀目前部門、有未儲存修改時不動、有載入中樣式與完成提示。 */
const fs = require('fs'), assert = require('assert'), r = f => fs.readFileSync(__dirname + '/../../' + f, 'utf8');
const acc = r('core/js/account.js'), css = r('core/board.css'), st = r('core/js/store-firestore.js'), ic = r('core/js/icons.js');
assert(/data-fb-refresh/.test(acc) && /強制刷新/.test(acc), '有這一列');
assert((acc.match(/refreshSec\(\)/g) || []).length >= 2, "登入前、登入後兩處都用");
assert(/fs\.dropCache\(\)[\s\S]*storeFsLoad\(true\)/.test(acc), '先作廢再強制重讀目前部門');
assert(/if\(editing\|\|dirty\)/.test(acc), '有未儲存修改不動');
assert(/已更新為最新內容/.test(acc) && /更新中/.test(acc), '載入中與完成提示');
assert(/dropCache/.test(st) && /"refresh"/.test(ic) && /aria-busy="true"\] \.sr-spin/.test(css), '快取作廢、圖示、樣式');
assert(!/!important/.test(css.split('強制刷新那一列')[1].split('\n').slice(0, 5).join('\n')), '沒有 !important');
console.log('fc3 通過');
