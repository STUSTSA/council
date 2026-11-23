/* AI 小幫手（core/js/ai.js、ai-model.js、ai-help.md）：
   1. 預設（enabled:false）：沒有圓鈕、沒有面板、完全不載入 ai-model.js 與 Firebase AI 的 SDK
   2. 打開後：查詢函式只有三個（唯讀）、系統提示含使用說明與今天日期、App Check 金鑰有送進去
   3. 問「會長可預約的時段」→ 模型呼叫 president_slots → 查到的時段＝開放時段扣掉被鎖的格（走既有 Firestore 讀取與規則）
   4. 模型輸出裡的 HTML 一律跳脫（不產生 img、不執行 onerror）、只轉 **粗體**
   5. 沒登入：請先登入、不打模型；每人每日次數：超過上限不打模型；Esc 關閉面板；手機寬度面板在工具列上方、不超出畫面
   Gemini 與 App Check 的 SDK 用 route 換成假模組（不連外）；Firestore 用模擬器。
   執行：cd backend && npm run test:web（或單跑 firebase emulators:exec … node ../tools/tests/ai1.js）；OUT=資料夾 會順便存截圖 */
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const {createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..','..');const breq=createRequire(path.join(ROOT,'backend','package.json'));
const EMU=process.env.FIRESTORE_EMULATOR_HOST;if(!EMU){console.error('要在模擬器裡跑：cd backend && npm run test:web');process.exit(1)}
const PORT=8302,OUT=process.env.OUT;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.md':'text/markdown'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(r)});
let fails=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(!c)fails++};
const FAKE_AI=`const L=window.__aiLog=window.__aiLog||{sent:[]};
export class GoogleAIBackend{}
export const Schema={object:o=>({t:'object',...o}),string:o=>({t:'string',...o}),enumString:o=>({t:'enum',...o})};
export const getAI=()=>({});
export const getGenerativeModel=(ai,p)=>{L.sys=p.systemInstruction;L.model=p.model;L.decls=p.tools[0].functionDeclarations.map(d=>d.name);
  return {startChat:()=>({sendMessage:async parts=>{L.sent.push(parts);const f=Array.isArray(parts)?parts[0]:null;
    if(f&&f.functionResponse){const t='查到：'+JSON.stringify(f.functionResponse.response)+' <img src=x onerror="window.__x=1"> **粗體**';return {response:{functionCalls:()=>undefined,text:()=>t}}}
    if(/預約/.test(parts))return {response:{functionCalls:()=>[{name:'president_slots',args:{}}],text:()=>{throw new Error('no text')}}};
    return {response:{functionCalls:()=>undefined,text:()=>'我不知道。'}}}})}};`;
const FAKE_AC=`export class ReCaptchaEnterpriseProvider{constructor(k){this.k=k}}export const initializeAppCheck=(a,o)=>{window.__ac=o.provider.k};`;

(async()=>{
  await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
  const {initializeTestEnvironment}=breq('@firebase/rules-unit-testing');const firebase=breq('firebase/compat/app');breq('firebase/compat/firestore');
  const [h,pt]=EMU.split(':');
  const t=await initializeTestEnvironment({projectId:'demo-stustsa-board',firestore:{host:h,port:+pt,rules:fs.readFileSync(path.join(ROOT,'backend/firestore.rules'),'utf8')}});
  await t.clearFirestore();
  const tok=uid=>({sub:uid,user_id:uid,email:uid+'@example.test',email_verified:true,firebase:{sign_in_provider:'google.com',identities:{}}});
  const G=1800000,base=Math.ceil((Date.now()+864e5)/G)*G,TS=firebase.firestore.Timestamp;
  await t.withSecurityRulesDisabled(async c=>{const d=c.firestore(),now=TS.now();
    await d.doc('calendars/president').set({name:'會長',managers:[],gridMin:30,maxSlots:4,horizonDays:60,maxPendingPerUser:3,rev:1,updatedAt:now,updatedBy:'x'});
    await d.doc('openWindows/w1').set({ownerId:'president',start:TS.fromMillis(base),end:TS.fromMillis(base+4*G),updatedAt:now,updatedBy:'x'});
    await d.doc(`slots/president_${base/G+1}`).set({ownerId:'president',idx:base/G+1,ref:'b1'});});   /* 第二格被鎖：可預約＝第 1 格、第 3～4 格 */
  const b=await chromium.launch();const cfgSrc=fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8').replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1');
  const open=async(o,{user='vw',w=1200,hh=850,dark=false}={})=>{
    const ctx=await b.newContext({viewport:{width:w,height:hh},serviceWorkers:'block',colorScheme:dark?'dark':'light'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>{const f=path.join(ROOT,'backend/node_modules/firebase',r.request().url().split('/').pop());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f,'utf8')})});
    const sdk=[];
    await ctx.route('**/firebase-ai.js',r=>{sdk.push('ai');r.fulfill({contentType:'text/javascript',body:FAKE_AI})});
    await ctx.route('**/firebase-app-check.js',r=>{sdk.push('ac');r.fulfill({contentType:'text/javascript',body:FAKE_AC})});
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(`http://127.0.0.1:${PORT}/dept/config.js*`,r=>{let s=cfgSrc.replace(new RegExp('(\\{ id: "president",[^\\n]*?)( \\},?\\n)'),'$1, source: "firestore"$2');
      s=s.replace(/firebase: \{[^}]*\}/,`firebase: { apiKey: "demo", authDomain: "", projectId: "demo-stustsa-board", appId: "", emulator: { host: "${h}", port: ${pt}, mockUserToken: ${user===null?'null':JSON.stringify(tok(user))} } }`);
      r.fulfill({contentType:'text/javascript',body:s})});
    const p=await ctx.newPage();p.errs=[];p.sdk=sdk;p.ctx=ctx;p.on('pageerror',e=>p.errs.push(e.message));
    await p.addInitScript(x=>{if(x)window.AI_OVERRIDE=x},o);
    await p.goto(`http://127.0.0.1:${PORT}/index.html?d=president`);
    await p.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#events'),null,{timeout:15000});await p.waitForTimeout(1500);
    if(dark)await p.evaluate(()=>document.documentElement.dataset.theme='dark');
    return p};
  const ask=async(p,q)=>{await p.fill('#aiPn input',q);await p.press('#aiPn input','Enter');await p.waitForFunction(()=>!document.querySelector('#aiPn.busy'),null,{timeout:10000});await p.waitForTimeout(150)};
  const shot=async(p,n)=>{if(OUT){fs.mkdirSync(OUT,{recursive:true});await p.screenshot({path:path.join(OUT,n+'.png')})}};

  /* 1 預設：完全不出現 */
  const d=await open(null);
  ok(await d.evaluate(()=>!document.getElementById('aiFab')&&!document.getElementById('aiPn')),'預設（enabled:false）：沒有圓鈕、沒有面板');
  ok(!d.sdk.length&&!d.errs.length,`預設：沒有載入 Firebase AI／App Check（${d.sdk.length}）、沒有頁面錯誤 ${d.errs.join('|')}`);
  await d.ctx.close();

  /* 2～4 打開、問預約時段 */
  const p=await open({enabled:true,appCheckSiteKey:'site-key-1',model:'test-model'});
  ok(await p.evaluate(()=>!!document.getElementById('aiFab')&&document.getElementById('aiPn').hidden),'enabled：有圓鈕、面板先收著');
  ok(!p.sdk.length,'還沒打開面板之前不載入模型 SDK');
  await p.click('#aiFab');await p.waitForTimeout(500);
  ok(await p.evaluate(()=>document.getElementById('aiPn').classList.contains('on')&&!document.getElementById('aiPn').hidden),'點圓鈕：面板打開');
  await shot(p,'ai_desk_open');
  await ask(p,'會長可預約的時段？');
  const R=await p.evaluate(([base,G])=>({log:window.__aiLog,ac:window.__ac,bot:[...document.querySelectorAll('#aiPn .ai-bot')].map(x=>x.innerHTML),
    exp:[bkFmt(base,base+G),bkFmt(base+2*G,base+4*G)],x:window.__x,imgs:document.querySelectorAll('#aiPn img').length,bold:document.querySelectorAll('#aiPn .ai-bot b').length}),[base,G]);
  ok(R.log.decls.join()==='president_slots,calendar_events,live_reports','查詢函式只有三個（都是讀）：'+R.log.decls.join());
  ok(R.log.model==='test-model'&&R.ac==='site-key-1','模型名稱與 App Check 金鑰照設定送進去');
  ok(/【使用說明】/.test(R.log.sys)&&/申請編輯權限/.test(R.log.sys)&&/今天是台灣時間 \d{4}-\d{2}-\d{2}/.test(R.log.sys)&&/不要憑記憶/.test(R.log.sys),'系統提示含使用說明、今天日期與「查不到就說不知道」的規則');
  const last=R.bot[R.bot.length-1];
  ok(R.exp.every(e=>last.includes(e.replace(/&/g,'&amp;'))),`查到的時段＝開放時段扣掉被鎖的格：${R.exp.join('、')}`);
  ok(!/b1/.test(last),'回傳裡沒有時段鎖的 ref（不外洩預約文件 ID）');
  ok(R.x===undefined&&R.imgs===0&&last.includes('&lt;img')&&R.bold===1,'模型輸出的 HTML 被跳脫（沒有 img、onerror 沒執行），只轉 **粗體**');
  await shot(p,'ai_desk_answer');
  await p.keyboard.press('Escape');await p.waitForTimeout(450);
  ok(await p.evaluate(()=>document.getElementById('aiPn').hidden),'Esc 關閉面板');
  ok(!p.errs.length,'沒有頁面錯誤 '+p.errs.join('|'));
  await p.ctx.close();

  /* 5 每日次數、沒登入、手機 */
  const q=await open({enabled:true,dailyLimit:1});
  await q.click('#aiFab');await q.waitForTimeout(400);
  await ask(q,'怎麼用？');await ask(q,'再問一題');
  const S=await q.evaluate(()=>({n:window.__aiLog.sent.length,last:[...document.querySelectorAll('#aiPn .ai-bot')].pop().textContent}));
  ok(S.n===1&&/今天已經問了 1 題/.test(S.last),`超過每日上限不再打模型（送出 ${S.n} 次）：${S.last}`);
  await q.ctx.close();
  const n=await open({enabled:true},{user:null});
  await n.click('#aiFab');await n.waitForTimeout(400);await ask(n,'你好');
  ok(await n.evaluate(()=>!window.__aiLog&&/請先登入/.test([...document.querySelectorAll('#aiPn .ai-bot')].pop().textContent)),'沒登入：請先登入，不呼叫模型');
  await n.ctx.close();
  for(const dark of [false,true]){
    const m=await open({enabled:true},{w:390,hh:760,dark});
    await m.click('#aiFab');await m.waitForTimeout(500);await ask(m,'會長可預約的時段？');
    const g=await m.evaluate(()=>{const r=document.getElementById('aiPn').getBoundingClientRect(),t=document.getElementById('tabbar').getBoundingClientRect();return {l:r.left,r:r.right,top:r.top,bot:r.bottom,tt:t.top,w:innerWidth}});
    ok(g.l>=0&&g.r<=g.w&&g.top>=0&&g.bot<=g.tt+1,`手機${dark?'深色':'淺色'}：面板在畫面內、不蓋住底部工具列（${JSON.stringify(g)}）`);
    await shot(m,'ai_mob_'+(dark?'dark':'light'));await m.ctx.close();
  }
  const dk=await open({enabled:true},{w:1366,hh:800,dark:true});await dk.click('#aiFab');await dk.waitForTimeout(500);await ask(dk,'會長可預約的時段？');await shot(dk,'ai_desk_dark');await dk.ctx.close();
  await b.close();await t.cleanup();srv.close();
  console.log(fails?`失敗 ${fails} 項`:'全部通過');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
