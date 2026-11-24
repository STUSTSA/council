/* lk_hint：下排連結自選圖示的入口（2026-11-24）。先在別處開 python3 -m http.server 8300（repo 複本放 data.json）。編輯中出現提示、加完連結自動開圖示選單、剛加的連結選得了圖示；桌面與手機 */
const {chromium}=require('playwright');const O='/tmp/lkh_';
(async()=>{const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fail++};
for(const [name,vp,mob,cs] of [['桌面_深色',{width:1366,height:768},false,'dark'],['手機_淺色',{width:412,height:860},true,'light']]){
const c=await b.newContext({viewport:vp,deviceScaleFactor:2,isMobile:mob,hasTouch:mob,colorScheme:cs});
await c.addInitScript(()=>{try{if(!localStorage.getItem('stustsa-links'))localStorage.setItem('stustsa-links',JSON.stringify([{u:'https://example.com',n:'企劃書產生器'}]))}catch(e){}});
await c.route(/^https?:\/\/(?!localhost)/,r=>r.abort());
const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8300/home.html');await p.waitForTimeout(1500);
ok(!await p.$('#hmLkHint.on'),name+' 平常沒有提示');
await p.click('.hm-lkadd');await p.waitForTimeout(600);
ok(!!await p.$('#hmLkHint.on'),name+' 編輯中出現提示');
const g=await p.evaluate(()=>{const h=document.querySelector('#hmLkHint').getBoundingClientRect(),d=document.querySelector('#hmDk').getBoundingClientRect();return [h.left,h.right,h.bottom,d.top,innerWidth]});
ok(g[0]>=0&&g[1]<=g[4]&&g[2]<=g[3],name+' 提示在下排上方、沒超出畫面 '+g.map(x=>Math.round(x)));
await p.screenshot({path:O+name+'_1編輯中提示.png'});
await p.fill('#hmLkU','netflix.com');await p.fill('#hmLkN','影片');await p.click('.hm-lkok');await p.waitForTimeout(700);
ok(await p.evaluate(()=>document.querySelector('#hmIcoPick')?.classList.contains('on')&&!document.querySelector('#hmLkHint').classList.contains('on')),name+' 加完自動開圖示選單、提示收起');
const q=await p.evaluate(()=>{const a=document.querySelector('#hmIcoPick').getBoundingClientRect(),l=[...document.querySelectorAll('.hm-lk')].pop().getBoundingClientRect();return [a.left,a.right,a.bottom,l.top,innerWidth]});
ok(q[0]>=0&&q[1]<=q[4]&&q[2]<=q[3],name+' 選單在新連結上方 '+q.map(x=>Math.round(x)));
await p.screenshot({path:O+name+'_2加完跳出選單.png'});
await p.click('.hm-ipb[data-i="bookmark"]');await p.waitForTimeout(400);
ok(await p.evaluate(()=>JSON.parse(localStorage.getItem('stustsa-links'))[1].i==='bookmark'&&document.querySelector('#hmLkHint').classList.contains('on')),name+' 選了存進去、提示回來');
await p.screenshot({path:O+name+'_3選好.png'});
await p.keyboard.press('Escape');await p.waitForTimeout(500);
ok(!await p.$('#hmLkHint.on')&&!await p.$('#hmDk.ed'),name+' 結束編輯提示消失');
ok(!errs.length,name+' 沒有錯誤 '+errs);
await c.close()}
await b.close();console.log(fail?'FAILED '+fail:'ALL OK')})();
