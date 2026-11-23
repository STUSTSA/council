/* sfx2：音效生命週期（core/js/sfx.js 的單一 AudioContext 管理）。固定 8300 埠，github 模式（home.html、index.html）。
   用可控的 AudioContext 替身：一開始是 suspended，resume() 才變 running；可以模擬「被系統暫停」（interrupted）、「resume 永遠不回來」（hang）、
   同時開著的 context 超過 6 個就丟例外（Chrome 的上限）；記錄每個 oscillator 的 start（＝真的有排音）。
   1. 主頁：第一次點擊就有聲、只建立一個 context、狀態 running
   2. 模擬從部門返回（pageshow persisted）＋系統把 context 暫停（interrupted）：下一次點擊照樣有聲、沒有重建
   3. 切到背景再回前景（visibilitychange）＋被暫停：回前景後點擊有聲
   4. 連續換頁 30 次：每次都有聲（節流 40ms 以外）、context 數沒有增加
   5. 真的進部門（換頁到 index.html，新的 context）→ 點分頁有聲 → 瀏覽器返回（可能是往返快取、也可能重新載入）→ 點主頁有聲
   6. resume 卡死：連點 40 次不丟例外、同時開著的 context 不超過上限；等 2 秒以上之後的下一次點擊重建一個新的就恢復有聲
   7. 音效關閉：全程不建立 context
   失敗會印 FAIL 並以非 0 結束 */
const {chromium}=require('playwright');
const U='http://127.0.0.1:8300/';
let fails=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(!v)fails++};
const STUB=()=>{
  const L=window.__ac={made:0,live:0,starts:0,list:[],mode:'ok',errs:0};
  class AC{
    constructor(){if(L.live>=6){L.errs++;throw new DOMException('The number of hardware contexts provided (6) is greater than or equal to the maximum bound (6).','NotSupportedError')}
      L.made++;L.live++;L.list.push(this);this.state='suspended';this.currentTime=0;this.sampleRate=44100;this.onstatechange=null;this.destination=this.n({});
      /* 在使用者操作裡建立的 context 會自己變 running（跟瀏覽器一樣是非同步） */
      if(L.mode==='ok')setTimeout(()=>this.set('running'),5)}
    set(s){if(this.state==='closed')return;this.state=s;this.onstatechange&&this.onstatechange()}
    n(o){return Object.assign(o,{connect:x=>x,disconnect(){}})}
    prm(rec,key){return {value:0,setValueAtTime(v){return this},exponentialRampToValueAtTime(){return this},linearRampToValueAtTime(){return this}}}
    createGain(){return this.n({gain:this.prm()})}
    createDynamicsCompressor(){return this.n({threshold:this.prm(),knee:this.prm(),ratio:this.prm(),attack:this.prm(),release:this.prm()})}
    createBuffer(c,n){const d=new Float32Array(n);return {getChannelData:()=>d}}
    createBiquadFilter(){return this.n({type:'',frequency:this.prm(),Q:this.prm()})}
    createBufferSource(){return this.n({buffer:null,start(){}})}
    createOscillator(){const o=this.n({type:'sine',stop(){}});o.frequency=this.prm();o.start=()=>{if(this.state==='running')L.starts++};return o}
    resume(){if(this.state==='closed')return Promise.reject(new Error('closed'));if(L.mode==='hang')return new Promise(()=>{});
      return new Promise(r=>setTimeout(()=>{this.set('running');r()},20))}
    close(){if(this.state!=='closed'){this.state='closed';L.live--}return Promise.resolve()}}
  window.AudioContext=AC;window.webkitAudioContext=AC};
const st=p=>p.evaluate(()=>({made:window.__ac.made,live:window.__ac.live,starts:window.__ac.starts,errs:window.__ac.errs,state:(window.__ac.list.filter(c=>c.state!=='closed').pop()||{}).state}));
/* 點一下後有沒有排音（starts 增加） */
const sound=async(p,sel,ms=220)=>{const a=(await st(p)).starts;await p.click(sel);await p.waitForTimeout(ms);return (await st(p)).starts>a};
(async()=>{
  const b=await chromium.launch();
  const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true,serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    if(o.off)await ctx.addInitScript(()=>{try{localStorage.setItem('stustsa-ui',JSON.stringify({pal:'fin',sound:false}))}catch(_){}});
    await ctx.addInitScript(STUB);const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.goto(U+'home.html');await p.waitForTimeout(3300);return p};
  const p=await mk();
  /* 1 */
  ok(await sound(p,'#hmPub'),'1. 第一次點擊（全會行事曆）有聲');
  let s=await st(p);ok(s.made===1&&s.state==='running','1. 只建立一個 context、狀態 running：'+JSON.stringify(s));
  await p.keyboard.press('Escape');await p.waitForTimeout(500);
  /* 2：模擬從部門返回＋系統暫停 */
  await p.evaluate(()=>{window.__ac.list[0].set('interrupted');window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}))});await p.waitForTimeout(100);
  ok(await sound(p,'#hmPub',300),'2. 返回主頁（pageshow persisted、context 被暫停）後第一下點擊有聲');
  s=await st(p);ok(s.made===1,'2. 沒有為了還原頁面重建 context：'+JSON.stringify(s));
  await p.keyboard.press('Escape');await p.waitForTimeout(500);
  /* 3：背景再回前景 */
  await p.evaluate(()=>{const c=window.__ac.list[0];c.set('suspended');Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    setTimeout(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))},300)});await p.waitForTimeout(600);
  ok(await sound(p,'#hmPub',300),'3. 背景再回前景後點擊有聲');
  await p.keyboard.press('Escape');await p.waitForTimeout(500);
  /* 4：連續點 30 次 */
  let miss=0;const a0=(await st(p)).starts;
  for(let i=0;i<30;i++){const a=(await st(p)).starts;await p.click('#hmPub');await p.waitForTimeout(90);if((await st(p)).starts===a)miss++;await p.keyboard.press('Escape');await p.waitForTimeout(380);}
  s=await st(p);ok(miss===0&&s.made===1,`4. 連續 30 次開關：每次有聲（缺席 ${miss} 次）、context 沒有增加（${s.made}）`);
  /* 6：卡死 */
  await p.evaluate(()=>{window.__ac.mode='hang';window.__ac.list[0].set('suspended')});
  for(let i=0;i<40;i++){await p.click('#hmPub').catch(()=>{});await p.waitForTimeout(30);await p.keyboard.press('Escape');await p.waitForTimeout(30)}
  s=await st(p);ok(s.errs===0&&s.live<=6,`6. resume 卡死連點 40 次：沒有丟 context 上限例外（${s.errs}）、同時開著 ${s.live} 個、共建立 ${s.made} 個`);
  await p.waitForTimeout(2200);await p.evaluate(()=>{window.__ac.mode='ok'});
  await p.click('#hmPub').catch(()=>{});await p.waitForTimeout(400);await p.keyboard.press('Escape');await p.waitForTimeout(500);
  ok(await sound(p,'#hmPub',400),'6. 卡死恢復後（重建）點擊又有聲');
  s=await st(p);ok(s.live<=2&&s.state==='running',`6. 恢復後只留一個在跑：${JSON.stringify(s)}`);
  ok(p.errs.length===0,'主頁沒有 JS 錯誤：'+p.errs.join('|'));
  /* 5：進部門再返回（真實換頁） */
  const q=await mk();
  await q.evaluate(()=>{sessionStorage.setItem('x','1')});
  await q.keyboard.press('Enter').catch(()=>{});await q.waitForTimeout(100);
  const href=await q.evaluate(()=>{const d=(window.D||[])[0];return typeof href==='function'&&d?href(d):null}).catch(()=>null);
  await q.goto(U+(href||'index.html'));await q.waitForTimeout(2500);
  let ok5=false;for(const sel of ['#tabbar .tab:nth-child(2)','#tabbar .tab']){const a=(await st(q)).starts;await q.click(sel).catch(()=>{});await q.waitForTimeout(300);if((await st(q)).starts>a){ok5=true;break}}
  ok(ok5,'5. 進部門（index.html）後點分頁有聲');
  await q.goBack();await q.waitForTimeout(2500);
  ok(await sound(q,'#hmPub',400),'5. 瀏覽器返回回到主頁後點擊有聲：'+JSON.stringify(await st(q)));
  await q.keyboard.press('Escape');await q.waitForTimeout(500);
  ok(await sound(q,'#hmPub',400),'5. 返回後再點一次還是有聲');
  /* 7 */
  const r=await mk({off:true});await r.click('#hmPub').catch(()=>{});await r.waitForTimeout(400);
  ok((await st(r)).made===0,'7. 音效關閉：沒有建立 context');
  await b.close();console.log(fails?`${fails} 項失敗`:'全部通過');process.exit(fails?1:0)})();
