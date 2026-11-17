/* github 模式「匯入備份」（events.js 的 #importFile，02D 審查）：備份裡沒有的只在 GitHub 模式有的欄位沿用目前的值，而且成組沿用：
   1. 從新資料庫匯出的備份（沒有 sync、pwKdf、pwHash、minutes，身分沒有 kdf、tok）：全部沿用目前的值；寫回 GitHub 的內容也有
   2. 備份沒有 sync、但有舊的 pwKdf：整組沿用目前的（不會把目前的權杖配上舊的密碼）
   3. 備份裡某個身分只有 kdf、沒有 tok：那個身分的 kdf、tok 都用備份的（不補 tok）
   4. 備份有 sync、沒有 pwKdf：整組用備份的（目前的 pwKdf 不留下）
   機密欄位只在頁面裡比對，輸出只有通過／失敗。固定 8300 埠（CLAUDE.md 的暫存複本做法）。 */
const c=require('./common');(async()=>{const k=await c.setup();const {b,mk,login}=k;
let fails=0;const A=(ok,m)=>{console.log((ok?'通過 ':'失敗 ')+m);if(!ok){fails++;process.exitCode=1}};
const p=await mk(1300,900,'light',false);await login(p);
await p.evaluate(()=>{state.minutes=[{date:'2026-11-01',dept:'rights',items:['測試用的會議紀錄']}]});
const pre=await p.evaluate(()=>({pw:!!state.pwKdf,sync:!!state.sync,mem:state.members.length,kt:state.members.every(m=>m.kdf&&m.tok)}));
A(pre.pw&&pre.sync&&pre.mem>0&&pre.kt,'前置：目前的看板有雲端設定、共用密碼、身分的密碼與權杖、會議紀錄');
/* fn（在頁面裡執行）：拿目前的看板做一份備份並改掉一些欄位；回傳 JSON 字串（不印出） */
const make=fn=>p.evaluate(fn=>{window.__cur=JSON.parse(JSON.stringify(state));const o=JSON.parse(JSON.stringify(state));(0,eval)(fn)(o);return JSON.stringify(o)},fn.toString());
const imp=async(txt,name)=>{const n=k.st.commits.length;await p.setInputFiles('#importFile',{name,mimeType:'application/json',buffer:Buffer.from(txt)});
  await p.waitForSelector('#dlg[open]',{timeout:8000});await p.click('#dlg [data-act="ok"]');
  for(let i=0;i<20&&k.st.commits.length===n;i++)await p.waitForTimeout(250);await p.waitForTimeout(300);return k.st.commits.length>n};
/* 比對（頁面裡）：k＝欄位、from＝'cur'（匯入前的看板）或 'bak'（備份） */
const same=(keys,from)=>p.evaluate(([keys,from])=>{const S=v=>JSON.stringify(v===undefined?null:v),src=from==='cur'?window.__cur:window.__bak;return keys.every(k=>S(state[k])===S(src[k]))},[keys,from]);
const remoteSame=keys=>{const r=k.remote();return p.evaluate(([keys,r])=>{const S=v=>JSON.stringify(v===undefined?null:v);return keys.every(x=>S(r[x])===S(state[x]))&&
  state.members.every(m=>{const o=r.members.find(y=>y.id===m.id);return o&&S(o.kdf)===S(m.kdf)&&S(o.tok)===S(m.tok)})},[keys,r])};

/* 1. 從新資料庫匯出的備份 */
let t=await make(o=>{for(const x of ['sync','pwKdf','pwHash','minutes'])delete o[x];o.members.forEach(m=>{delete m.kdf;delete m.tok});o.title='匯入測試一'});
A(await imp(t,'from-firestore.json'),'1. 匯入後寫回 GitHub');
A(await p.evaluate(()=>state.title==='匯入測試一'),'1. 看板內容換成備份的');
A(await same(['sync','pwKdf','pwHash','minutes'],'cur'),'1. 雲端設定、共用密碼、會議紀錄沿用目前的值');
A(await p.evaluate(()=>state.members.every(m=>{const S=JSON.stringify,o=window.__cur.members.find(x=>x.id===m.id);return o&&!!m.kdf&&!!m.tok&&S(m.kdf)===S(o.kdf)&&S(m.tok)===S(o.tok)})),'1. 每個身分的密碼與權杖沿用目前的值');
A(await remoteSame(['sync','pwKdf','minutes']),'1. 寫回 GitHub 的內容也有這些欄位');

/* 2. 沒有 sync、有舊的 pwKdf：整組沿用目前的 */
t=await make(o=>{delete o.sync;o.pwKdf='b2xk:b2xk';o.title='匯入測試二'});
A(await imp(t,'old-pw.json'),'2. 匯入後寫回 GitHub');
A(await p.evaluate(()=>state.title==='匯入測試二'),'2. 看板內容換成備份的');
A(await same(['sync','pwKdf','pwHash'],'cur'),'2. 備份沒有 sync：sync、pwKdf、pwHash 整組沿用目前的（備份裡舊的 pwKdf 不用）');

/* 3. 某個身分只有 kdf、沒有 tok */
t=await make(o=>{const m=o.members[0];m.kdf='c2FsdA:aGFzaA';delete m.tok;window.__mid=m.id;o.title='匯入測試三'});
A(await imp(t,'half-member.json'),'3. 匯入後寫回 GitHub');
A(await p.evaluate(()=>{const m=state.members.find(x=>x.id===window.__mid);return m&&m.kdf==='c2FsdA:aGFzaA'&&!('tok' in m)}),'3. 身分只有 kdf：用備份的 kdf，不補目前的 tok');

/* 4. 有 sync、沒有 pwKdf：整組用備份的 */
t=await make(o=>{o.sync={...o.sync,branch:'restore-test'};delete o.pwKdf;delete o.pwHash;o.title='匯入測試四'});
await p.evaluate(t=>{window.__bak=JSON.parse(t)},t);
A(await imp(t,'with-sync.json'),'4. 匯入後寫回 GitHub');
A(await same(['sync'],'bak')&&await p.evaluate(()=>!state.pwKdf&&!state.pwHash),'4. 備份有 sync：整組用備份的（目前的 pwKdf 不留下）');

const errs=p.errs.filter(e=>!/Failed to load resource/.test(e));A(!errs.length,'沒有頁面錯誤 '+errs.join(' | '));
await b.close();console.log(fails?`失敗 ${fails} 項`:'全部通過');
})().catch(e=>{console.error(e);process.exit(1)});
