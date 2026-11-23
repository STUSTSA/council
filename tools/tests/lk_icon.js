/* lk_icon：下排連結自訂圖示（2026-11-23）。先在別處開 python3 -m http.server 8300（repo 複本放 data.json）。編輯中點連結→選圖示→存進 localStorage 的 i、重新整理仍在；桌面與手機 */
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
for(const [name,vp,mob] of [['desk',{width:1300,height:800},false],['mob',{width:390,height:800},true]]){
const c=await b.newContext({viewport:vp,deviceScaleFactor:2,isMobile:mob,hasTouch:mob,colorScheme:'dark'});
await c.addInitScript(()=>{try{if(!localStorage.getItem('stustsa-links'))localStorage.setItem('stustsa-links',JSON.stringify([{u:'https://example.com',n:'企劃書產生器'},{u:'https://192.168.0.1',n:'路由器'}]))}catch(e){}});
await c.route(/^https?:\/\/(?!localhost)/,r=>r.abort());
const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8300/home.html');await p.waitForTimeout(1500);
await p.click('.hm-lkadd');await p.waitForTimeout(500);
await p.click('.hm-dk-in>.hm-lk:nth-of-type(1) .hm-lkc',{force:true});await p.waitForTimeout(500);
await p.screenshot({path:`/tmp/ip_${name}_pick.png`});
await p.click('.hm-ipb[data-i="flag"]');await p.waitForTimeout(400);
console.log(name,await p.evaluate(()=>[localStorage.getItem('stustsa-links'),document.querySelector('.hm-lk.pick svg')!=null,document.querySelector('#hmIcoPick').classList.contains('on')]),errs);
await p.screenshot({path:`/tmp/ip_${name}_after.png`});
await p.reload();await p.waitForTimeout(1200);console.log('reload pick',await p.evaluate(()=>document.querySelectorAll('.hm-lk.pick').length));
await c.close()}
await b.close()})();
