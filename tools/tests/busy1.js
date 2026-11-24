/* busy1：處理中防呆（util.js 的 busyRun，board.css「處理中」段）。github 模式，固定 8300 埠。
   - 很快就好的動作：不出現遮罩與膠囊（不閃），但進行中點不到後面的按鈕；
   - 慢的動作：超過 BUSY_SHOW 淡入「處理中…」膠囊，蓋過整頁、點不到後面、鍵盤被擋；結束後收掉，後面的按鈕又點得到；
   - 失敗（丟錯）也會收掉，錯誤照樣往外丟；巢狀時最外層結束才收；
   - 等很久（BUSY_LONG）出現「先關掉」，按了只收起這一層；
   - 開著對話框時也蓋在對話框上面；手機與深色各看一次位置。失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';
let fails=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(!v)fails++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const br=await chromium.launch();
  for(const [name,vp,scheme] of [['桌面淺色',{width:1366,height:800},'light'],['手機深色',{width:412,height:900},'dark']]){
    const cx=await br.newContext({viewport:vp,colorScheme:scheme});const p=await cx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)\.com|api\.github\.com/,r=>r.abort());
    await p.goto(U+'index.html');await p.waitForFunction(()=>typeof busyRun==='function'&&document.body);await W(800);
    await p.evaluate(()=>{const b=document.createElement('button');b.id='__probe';b.textContent='x';b.style.cssText='position:fixed;left:20px;top:20px;z-index:98';b.onclick=()=>window.__hit=(window.__hit||0)+1;document.body.appendChild(b);
      window.__keys=0;addEventListener('keydown',()=>window.__keys++)});
    const st=()=>p.evaluate(()=>{const el=document.getElementById('busy');if(!el)return {on:false};const pill=el.querySelector('.busy-pill'),r=pill.getBoundingClientRect(),c=getComputedStyle(pill);
      return {on:el.classList.contains('on'),show:el.classList.contains('show'),long:el.classList.contains('long'),text:el.querySelector('.busy-t').textContent,op:+c.opacity,cx:r.left+r.width/2,cy:r.top+r.height/2,w:innerWidth,h:innerHeight,
        full:el.getBoundingClientRect().width>=innerWidth-1&&el.getBoundingClientRect().height>=innerHeight-1,x:getComputedStyle(el.querySelector('.busy-x')).display}});
    const hit=async()=>{await p.mouse.click(30,30);return p.evaluate(()=>window.__hit||0)};
    /* 快的 */
    await p.evaluate(()=>{window.__r=busyRun(()=>new Promise(r=>setTimeout(()=>r(7),150)))});
    await W(60);let s=await st();ok(s.on&&!s.show&&s.op===0,`${name}：很快就好的動作不出現膠囊`);
    ok(await hit()===0,`${name}：進行中點不到後面的按鈕`);
    ok(await p.evaluate(()=>window.__r)===7,`${name}：回傳值照舊`);s=await st();ok(!s.on,`${name}：結束後收掉`);
    ok(await hit()===1,`${name}：結束後後面的按鈕點得到`);
    /* 慢的 */
    await p.evaluate(()=>{window.__r=busyRun(()=>new Promise(r=>setTimeout(r,1500)),'儲存中…')});
    await W(900);s=await st();
    ok(s.on&&s.show&&s.op>0.95&&s.text==='儲存中…',`${name}：慢的動作淡入「儲存中…」膠囊`);
    ok(s.full&&Math.abs(s.cx-s.w/2)<1&&Math.abs(s.cy-s.h/2)<1,`${name}：蓋滿整頁、膠囊在正中間`);
    ok(s.x==='none',`${name}：一般情況沒有「先關掉」`);
    ok(await hit()===1,`${name}：膠囊出現時點不到後面`);
    const k0=await p.evaluate(()=>window.__keys);await p.keyboard.press('Enter');ok(await p.evaluate(()=>window.__keys)===k0,`${name}：鍵盤被擋住`);
    await p.evaluate(()=>window.__r);s=await st();ok(!s.on&&!s.show,`${name}：慢的動作結束後收掉`);
    /* 失敗、巢狀 */
    const err=await p.evaluate(()=>busyRun(async()=>{throw Object.assign(new Error('x'),{code:'boom'})}).then(()=>'',e=>e.code));
    s=await st();ok(err==='boom'&&!s.on,`${name}：失敗也收掉，錯誤照樣丟出`);
    await p.evaluate(()=>{window.__r=busyRun(async()=>{await busyRun(()=>new Promise(r=>setTimeout(r,100)));await new Promise(r=>setTimeout(r,300))})});
    await W(220);s=await st();ok(s.on,`${name}：巢狀時裡面那層結束還不收`);await p.evaluate(()=>window.__r);s=await st();ok(!s.on,`${name}：最外層結束才收`);
    /* 等很久 */
    await p.evaluate(()=>{window.__done=0;const o=setTimeout;window.setTimeout=(f,ms,...a)=>o(f,ms===BUSY_LONG?600:ms,...a);window.__r=busyRun(()=>new Promise(r=>o(()=>{window.__done=1;r()},2500)));window.setTimeout=o});
    await W(1000);s=await st();ok(s.long&&s.x!=='none'&&/還在處理/.test(s.text),`${name}：等很久出現「先關掉」`);
    await p.click('#busy .busy-x');s=await st();ok(!s.on&&await p.evaluate(()=>window.__done)===0,`${name}：按「先關掉」只收起這一層，動作繼續`);
    ok(await hit()===2,`${name}：收起後可以繼續操作`);
    await p.evaluate(()=>window.__r);s=await st();ok(!s.on&&await p.evaluate(()=>Busy.n)===0,`${name}：之後動作結束，計數歸零`);
    /* 對話框上面 */
    await p.evaluate(()=>{ask('測試',[],{})});await p.waitForSelector('dialog[open]');await W(400);
    await p.evaluate(()=>{window.__r=busyRun(()=>new Promise(r=>setTimeout(r,900)))});
    await W(600);
    const top=await p.evaluate(()=>{const e=document.elementFromPoint(innerWidth/2,innerHeight/2);return !!(e&&e.closest('#busy'))});
    ok(top,`${name}：對話框開著時也蓋在最上面`);
    await p.screenshot({path:__dirname+`/busy1_${vp.width}_${scheme}.png`});
    await p.evaluate(()=>window.__r);
    await cx.close();
  }
  await br.close();
  console.log(fails?`\n${fails} 項失敗`:'\n全部通過');process.exit(fails?1:0);
})();
