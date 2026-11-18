/* xs1：會長室追蹤面板、會長室文件、工作報告的跳脫攻擊測試（2026-11-16，main 的 XSS 修正）
   用 8300（CLAUDE.md 的準備方式）。開會長室（?d=president），在頁面裡直接塞惡意資料再呼叫畫面函式：
   A 追蹤面板（follow.js fwBody／renderFollows）：被追蹤部門的議題第一個註記日期塞「00000<img 」、下一段文字塞「src=x onerror=…」；
     即時回報的完成日、最後更新日、議題結案日也塞 <img；追蹤項目 ID 塞引號與標籤。
   B 會長室文件（renderDocs、docURL）：網址填 javascript:、data:，文件 ID 塞引號與標籤；平常的網址照舊補 https://。
   C 工作報告（report.js rptHTML）：同一個議題底下，前一筆即時回報的完成日塞「2026-<img 」、下一筆的名稱塞「a src=x onerror=… 」；
     處理經過的日期、結案日也塞 <img。
   每段確認：window.__x 沒被設定、畫面裡沒有多出 img／svg、惡意字串照字面顯示。壞了以非 0 結束。 */
const {chromium}=require('playwright');
const SITE='http://127.0.0.1:8300/';
let fail=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(!c)fail++};
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1300,height:900},serviceWorkers:'block'});
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1:8300)/,r=>r.abort());   /* 其他對外請求一律擋掉 */
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(SITE+'index.html?d=president');await p.waitForTimeout(1800);
  ok(await p.evaluate(()=>typeof fwBody==='function'&&typeof renderDocs==='function'&&typeof rptHTML==='function'&&!!CFG.follow),'會長室頁面載入、三個畫面函式都在');

  /* A 追蹤面板 */
  const A=await p.evaluate(async()=>{
    window.__x=undefined;
    const dept=(window.BOARD_DEPTS||[]).find(d=>d.id!==CFG.deptId&&!d.follow);
    const d=JSON.parse(JSON.stringify(state));
    const iss={id:'iX',title:'議題X',tags:['規劃'],cur:0,staff:[],labels:[],links:[],note:'',start:'2026-01-01',end:'2026-12-31',
      markers:[{id:'m1',date:'00000<img ',text:'src=x onerror=window.__x=1//'},{id:'m2',date:'2026-05-01',text:'第二個'}]};
    const done={...iss,id:'iD',title:'議題D',doneAt:'2026-<img ',markers:[]};
    d.issues=[iss,done];
    d.events=[{id:'eL',name:'回報L',desc:'內容',round:1,touchedAt:'00000<img ',times:[],links:[],staff:[],labels:[]},
              {id:'eD',name:'回報D',desc:'',round:1,doneAt:'<img src',touchedAt:'',times:[],links:[],staff:[],labels:[]}];
    fwCache.set(dept.id,{at:Date.now(),data:normalize(d),err:''});
    state.follows=[{id:'f1',dept:dept.id,kind:'issue',ref:'iX'},{id:'f2',dept:dept.id,kind:'done',ref:'iD'},
                   {id:'f3',dept:dept.id,kind:'live',ref:'eL'},{id:'f4"><img src=x onerror=window.__x=2>',dept:dept.id,kind:'done',ref:'eD'}];
    renderFollows();
    await new Promise(r=>setTimeout(r,1200));
    const box=document.querySelector('#follows');
    return {x:window.__x,imgs:box.querySelectorAll('img,svg:not(.ico):not([class])').length,raw:box.querySelectorAll('img').length,
      n:box.querySelectorAll('article.fw').length,txt:box.textContent,ids:[...box.querySelectorAll('article.fw')].map(a=>a.dataset.fw)};
  });
  ok(A.x===undefined,`A 追蹤面板沒有執行注入的程式（window.__x=${A.x}）`);
  ok(A.raw===0,`A 追蹤面板沒有多出 img（${A.raw}）`);
  ok(A.n===4,`A 四筆追蹤都畫出來（${A.n}）`);
  ok(/<img /.test(A.txt)&&/src=x onerror=window\.__x=1/.test(A.txt),'A 惡意日期與註記照字面顯示');
  ok(A.ids.includes('f4"><img src=x onerror=window.__x=2>'),'A 追蹤項目 ID 原樣留在 data-fw（沒有斷開屬性）');

  /* B 會長室文件 */
  const B=await p.evaluate(async()=>{
    window.__x=undefined;
    state.docs=[{id:'d1"><img src=x onerror=window.__x=3>',name:'惡意一',url:'javascript:window.__x=4'},
                {id:'d2',name:'惡意二',url:'JavaScript:window.__x=5'},
                {id:'d3',name:'惡意三',url:'data:text/html,<script>window.__x=6</script>'},
                {id:'d4',name:'一般',url:'drive.google.com/x'},
                {id:'d5',name:'完整網址',url:'https://docs.google.com/y'}];
    renderDocs();
    await new Promise(r=>setTimeout(r,800));
    const box=document.querySelector('#docsList');
    const as=[...box.querySelectorAll('a.doc-pill')];
    return {x:window.__x,img:box.querySelectorAll('img').length,hrefs:as.map(a=>a.getAttribute('href')),ids:as.map(a=>a.dataset.doc),
      ask:[docURL('javascript:alert(1)'),docURL(' data:text/html,x '),docURL('drive.google.com/z'),docURL('http://a.b/'),docURL('')]};
  });
  ok(B.x===undefined,`B 文件連結沒有執行注入的程式（window.__x=${B.x}）`);
  ok(B.img===0,`B 文件列表沒有多出 img（${B.img}）`);
  ok(B.hrefs.length===5&&B.hrefs.every(h=>/^https?:\/\//i.test(h)),`B 每個連結都是 http(s) 開頭：${JSON.stringify(B.hrefs)}`);
  ok(!B.hrefs.some(h=>/^(javascript|data):/i.test(h)),'B 沒有 javascript:／data: 開頭的連結');
  ok(B.hrefs[3]==='https://drive.google.com/x'&&B.hrefs[4]==='https://docs.google.com/y','B 一般網址照舊（沒寫 https 的補上）');
  ok(B.ids[0]==='d1"><img src=x onerror=window.__x=3>','B 文件 ID 原樣留在 data-doc');
  ok(B.ask[0].startsWith('https://')&&B.ask[1].startsWith('https://')&&B.ask[2]==='https://drive.google.com/z'&&B.ask[3]==='http://a.b/'&&B.ask[4]==='',`B 存檔用的 docURL：${JSON.stringify(B.ask)}`);
  /* 點 javascript: 那顆：只會開新分頁到 https://javascript:…（被上面的 route 擋掉），本頁不執行 */
  const pop=ctx.waitForEvent('page',{timeout:3000}).catch(()=>null);
  await p.click('#docsList a.doc-pill >> nth=0').catch(()=>{});const pg=await pop;await p.waitForTimeout(500);
  ok(await p.evaluate(()=>window.__x)===undefined,'B 點了 javascript: 那顆文件也沒有執行');
  if(pg)await pg.close().catch(()=>{});

  /* C 工作報告 */
  const C=await p.evaluate(async()=>{
    window.__x=undefined;
    const base={tags:['規劃'],cur:0,staff:[],labels:[],links:[],note:'',start:'2026-01-01',end:'2026-12-31'};
    state.issues=[{...base,id:'iR',title:'議題R',markers:[{id:'r1',date:'2026-<img ',text:'處理'},{id:'r2',date:'',text:'未標'}]},
                  {...base,id:'iS',title:'議題S',doneAt:'2026-06-<img ',markers:[{id:'s1',date:'2026-06-02',text:'記'}]}];
    state.events=[{id:'e1',issueId:'iR',name:'第一筆',round:1,createdAt:'2026-06-01',doneAt:'2026-<img ',times:[],links:[],staff:[],labels:[]},
                  {id:'e2',issueId:'iR',name:'a src=x onerror=window.__x=7 ',round:1,createdAt:'2026-06-02',times:[],links:[],staff:[],labels:[]}];
    const d=rptData('2026-01-01','2026-12-31');d.issues=state.issues;
    const host=document.createElement('div');host.id='xsRpt';document.body.appendChild(host);
    host.innerHTML=rptHTML(d);
    await new Promise(r=>setTimeout(r,1200));
    const issues=host.querySelectorAll('.rpt-issue');
    const r={x:window.__x,img:[...host.querySelectorAll('img')].filter(i=>!i.closest('.cv-logo')).length,
      onerr:host.querySelectorAll('[onerror]').length,n:issues.length,txt:[...issues].map(a=>a.textContent).join('|')};
    host.remove();return r;
  });
  ok(C.x===undefined,`C 工作報告沒有執行注入的程式（window.__x=${C.x}）`);
  ok(C.img===0&&C.onerr===0,`C 報告裡沒有多出 img 或 onerror 屬性（img ${C.img}、onerror ${C.onerr}）`);
  ok(C.n===2,`C 兩個議題都畫出來（${C.n}）`);
  ok(/<img /.test(C.txt)&&/a src=x onerror=window\.__x=7/.test(C.txt),'C 惡意日期與名稱照字面顯示');

  ok(errs.length===0,`沒有頁面錯誤${errs.length?'：'+errs.join('；'):''}`);
  await b.close();
  console.log(fail?`xs1：失敗 ${fail} 項`:'xs1：全部通過');process.exit(fail?1:0);
})().catch(e=>{console.error('失敗 例外：',e);process.exit(1)});
