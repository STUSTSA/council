/* cs：自製下拉選單（.csel，dialog.js）在對話框裡：點開清單、方向鍵＋Enter 選、選了對話框不關；Esc 只收清單、不關對話框。
   用登入時的「選擇編輯身分」（team.js，看板已有身分時出現）。
   2026-11-15（03 T4）改寫：原本連 localhost:8104、按頁首「編輯」（#editBtn，11-06 已拿掉），修改前就壞了；現在走設定頁鎖頭，固定 8300 埠；逐項判斷、壞了以非 0 結束 */
const c=require('./common');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk}=await c.setup();
const p=await mk(600,700,'dark',false);await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:8000}).catch(()=>{});
await p.evaluate(()=>{localStorage.setItem('workboard:ghtoken','T');state.members=[{id:'m1',name:'白菜',role:'admin',kdf:'x:y'},{id:'m2',name:'小明',role:'member',kdf:'x:y'}]});
await p.click('#setBtn');await p.waitForTimeout(800);await p.click('#setOv .set-gate .primary');await p.waitForTimeout(600);
ok(await p.evaluate(()=>$('#dlg').open&&$('#dlgForm>b').textContent)==='選擇編輯身分','有身分時登入先選身分');
const v0=await p.$eval('#dlgForm input[name=who]',x=>x.value);
await p.click('#dlgForm .csel-btn');await p.waitForTimeout(400);
ok(await p.$eval('#dlgForm .csel',x=>x.classList.contains('open')),'點了展開清單');
await p.screenshot({path:'cs.png'});
await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');await p.waitForTimeout(300);
const r=[await p.$eval('#dlgForm input[name=who]',x=>x.value),(await p.textContent('#dlgForm .csel-v')).trim(),await p.evaluate(()=>$('#dlg').open),await p.$eval('#dlgForm .csel',x=>x.classList.contains('open'))];
console.log('picked',JSON.stringify([v0,...r]));
ok(r[0]&&r[0]!==v0&&r[1]===(r[0]==='m1'?'白菜':'小明')&&r[2]&&!r[3],'方向鍵＋Enter 選到下一個、標籤跟著換、清單收起、對話框還開著');
await p.click('#dlgForm .csel-btn');await p.waitForTimeout(200);await p.keyboard.press('Escape');await p.waitForTimeout(300);
ok(await p.evaluate(()=>$('#dlg').open)&&!(await p.$eval('#dlgForm .csel',x=>x.classList.contains('open'))),'Esc 只收清單、對話框還開著');
ok(!p.errs.length,'沒有錯誤 '+p.errs.join(' | '));
await b.close();process.exit(bad?1:0)})();
