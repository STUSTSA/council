/* fd1：日期、時刻欄位的格式整理與輸出跳脫（04）。用 8300（CLAUDE.md 的準備方式），不用模擬器。
   A 整理（store-map.js 的 tidy，normalize 與 toState 都會經過）：
     1. 測試資料檔原封不動（合格的值、沒填的欄位都不變；整理兩次結果相同）
     2. 不合格式的日期、時刻換成空值；型別不對的欄位換成空的；合格的照舊
     3. normalize 之後畫面照常畫得出來（不丟例外）
   B Firestore 讀回來（toState）：欄位型別不對、時間文字不合格式時不丟例外，時間改用時間戳記排出來
   C 輸出跳脫（不經整理、直接把含標記字元的字串放進畫面資料再畫）：週報清單、甘特圖、議題詳情、處理紀錄、完成紀錄，
     以及秘書處的各部門週報（?d=secretariat）。確認：沒有多出元素、字串照字面顯示。
   壞了以非 0 結束。 */
const {chromium}=require('playwright');const fs=require('fs');
const SITE='http://127.0.0.1:8300/';
let fail=0;const ok=(c,m)=>{console.log((c?'通過 ':'失敗 ')+m);if(!c)fail++};
const RAW=JSON.parse(fs.readFileSync(__dirname+'/data_test.json','utf8')),RAW5=JSON.parse(fs.readFileSync(__dirname+'/data_v5.json','utf8'));
const MARK='<i class="fdx">d</i>';   /* 含標記字元的字串：照字面顯示才對（日期只顯示前 10 個字，或其中第 6～10 個字） */
const LIT=[MARK,MARK.slice(0,10),MARK.slice(5,10)];
(async()=>{
  const b=await chromium.launch();
  const mk=async q=>{
    const ctx=await b.newContext({viewport:{width:1300,height:900},serviceWorkers:'block'});
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx.route('https://api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1:8300)/,r=>r.abort());
    /* 每個部門都當成 github 模式（不載入 Firebase） */
    await ctx.route(/\/dept\/config\.js(\?|$)/,async r=>{const res=await r.fetch();r.fulfill({response:res,body:(await res.text()).replace(/(\{ id: "[a-z]+",[^\n]*?), source: "[a-z]+"/g,'$1')})});
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    await p.goto(SITE+'index.html'+q);await p.waitForTimeout(1800);return p;
  };
  const p=await mk('');
  ok(await p.evaluate(()=>typeof StoreMap.tidy==='function'&&typeof normalize==='function'&&typeof cardHTML==='function'),'頁面載入，整理與畫面函式都在');

  /* ---------- A 整理 ---------- */
  for(const [name,raw] of [['data_test.json',RAW],['data_v5.json（舊版格式）',RAW5]]){
    const A1=await p.evaluate(raw=>{
      const a=JSON.stringify(StoreMap.tidy(JSON.parse(raw))),b=JSON.stringify(StoreMap.tidy(StoreMap.tidy(JSON.parse(raw))));
      /* 整個讀進來（遷移＋整理）的結果，跟「不整理、只遷移」比：合格的資料不能有差別 */
      const full=JSON.stringify(normalize(JSON.parse(raw))),keep=StoreMap.tidy;let plain;
      try{StoreMap.tidy=x=>x;plain=JSON.stringify(normalize(JSON.parse(raw)))}finally{StoreMap.tidy=keep}
      return {same:a===JSON.stringify(JSON.parse(raw)),twice:a===b,norm:full===plain};
    },JSON.stringify(raw));
    ok(A1.same,`A1 ${name} 經過整理後一字不變`);
    ok(A1.twice,`A1 ${name} 整理兩次結果相同`);
    ok(A1.norm,`A1 ${name} 讀進來（遷移＋整理）的結果跟沒有整理時相同`);
  }
  const A2=await p.evaluate(()=>{
    const bad=['abc','2026/11/01','2026-11-1','2026-11-01 ',20261101,['2026-11-01'],{d:1},true];
    const r={day:[],when:[],keep:true};
    for(const v of bad){
      const s=StoreMap.tidy({weeks:[{id:'w',date:v,text:'t'}],issues:[{id:'i',title:'t',start:v,end:v,doneAt:v,markers:[{id:'m',date:v,text:'x'}]}],
        events:[{id:'e',name:'n',createdAt:v,doneAt:v,roundAt:v,touchedAt:v,touched:[v,'2026-11-02'],times:[{id:'t',start:v,end:v,label:'l'}]}],reportBase:{date:v,issues:{}},termStart:v});
      r.day.push(s.weeks[0].date===''&&s.issues[0].start===''&&s.issues[0].end===''&&s.issues[0].markers[0].date===''&&s.reportBase.date===''&&s.termStart===''
        &&JSON.stringify(s.events[0].touched)==='["2026-11-02"]');
      r.when.push(s.issues[0].doneAt===null&&s.events[0].doneAt===null&&s.events[0].createdAt===''&&s.events[0].roundAt===''&&s.events[0].touchedAt===''
        &&s.events[0].times[0].start===''&&s.events[0].times[0].end==='');
    }
    const good={weeks:[{id:'w',date:'2026-11-01',text:'t'}],issues:[{id:'i',title:'t',start:'2026-11-01',end:'2026-12-01',doneAt:'2026-11-20',cur:1,tags:['a'],markers:[{id:'m',date:'2026-11-05',text:'x'}]}],
      events:[{id:'e',name:'n',createdAt:'2026-11-01',doneAt:'2026-11-20 09:30',roundAt:'2026-11-01T10:00',touchedAt:'2026-11-02T08:00:30',touched:['2026-11-01'],
        times:[{id:'t',start:'2026-11-20T10:00',end:'',label:'l',place:''}]}],range:{start:'2026-09',end:'2027-02'},reportBase:null};
    r.keep=JSON.stringify(StoreMap.tidy(JSON.parse(JSON.stringify(good))))===JSON.stringify(good);
    const odd=StoreMap.tidy({weeks:'x',issues:[null,5,{id:'i',title:7,note:{a:1},cur:'2',tags:'abc',staff:{a:1},labels:[1,'l'],markers:[null,'m',{id:'m',text:5}]}],
      events:[{id:'e',name:['n'],touched:'x',staff:'s',times:'t'}],labels:[{id:'l',name:5,kind:{}}],docs:{a:1},follows:'f',range:'x',reportBase:'r'});
    r.odd=Array.isArray(odd.weeks)&&odd.weeks.length===0&&odd.issues.length===1&&odd.issues[0].title==='7'&&odd.issues[0].note===''&&odd.issues[0].cur===0
      &&JSON.stringify(odd.issues[0].tags)==='[]'&&JSON.stringify(odd.issues[0].staff)==='[]'&&JSON.stringify(odd.issues[0].labels)==='["l"]'&&odd.issues[0].markers.length===1&&odd.issues[0].markers[0].text==='5'
      &&odd.events[0].name===''&&JSON.stringify(odd.events[0].touched)==='[]'&&JSON.stringify(odd.events[0].staff)==='[]'&&JSON.stringify(odd.events[0].times)==='[]'
      &&odd.labels[0].name==='5'&&odd.labels[0].kind===''&&JSON.stringify(odd.docs)==='[]'&&JSON.stringify(odd.follows)==='[]'&&!('range' in odd)&&odd.reportBase===null;
    return r;
  });
  ok(A2.day.every(Boolean),`A2 不合格式的日期換成空值（${A2.day.filter(Boolean).length}/${A2.day.length}）`);
  ok(A2.when.every(Boolean),`A2 不合格式的時刻換成空值（${A2.when.filter(Boolean).length}/${A2.when.length}）`);
  ok(A2.keep,'A2 合格的日期、時刻、月份原樣保留');
  ok(A2.odd,'A2 型別不對的欄位換成空的（陣列、字串、數字）');
  const A3=await p.evaluate(()=>{
    const keep=state;let err='';
    try{state=normalize({title:'t',weeks:[{id:'w1',date:5,text:'a'},{id:'w2',date:'x',text:'b'}],issues:[{id:'i1',title:'t',start:7,end:{},tags:'x',markers:'m',cur:'z'}],
      events:[{id:'e1',name:'n',desc:'d',report:true,touched:[1],createdAt:9,times:[{id:'t1',start:5,end:6,label:1}]}],range:5,follows:5,docs:5});
      render();renderDone();repHTML(wkStart(today()));doneWeeks([]);renderGantt()}catch(e){err=String(e&&e.message)}
    const s={w:state.weeks.map(w=>w.date),i:[state.issues[0].start,state.issues[0].end],r:typeof state.range.start};
    state=keep;render();return {err,s};
  });
  ok(!A3.err,`A3 型別全錯的資料 normalize 之後照常畫（${A3.err||'沒有例外'}）`);
  ok(A3.s.w.join('|')==='|'&&A3.s.i.join('|')==='|'&&A3.s.r==='string','A3 日期換成空字串、甘特圖範圍補預設值');

  /* ---------- B toState ---------- */
  const B=await p.evaluate(()=>{
    const ts=ms=>({__ts:ms}),T=Date.UTC(2026,10,20,2,0);   /* 台灣時間 2026-11-20 10:00 */
    const src={settings:{title:'t',range:'x',reportBase:{date:5,issues:'x'},docs:'d',follows:'f'},org:null,grant:null,
      cards:[{id:'fruit__c1',deptId:'fruit',title:'卡',state:'open',blocks:{id:['b1'],text:['x'],check:[null],time:[null]},timeIds:'x',staff:'s',labels:5,links:'l',round:'r',roundAt:5,touched:'t',touchedAt:{a:1},order:'o'}],
      issues:[{id:'fruit__i1',deptId:'fruit',title:'議',start:5,end:'x',doneAt:{},tags:'t',labels:'l',staff:7,markers:[null,'m',{id:'m1',date:9,text:'x'}],links:5}],
      weeks:[{id:'fruit__w1',deptId:'fruit',date:5,text:'a'},{id:'fruit__w2',deptId:'fruit',date:'2026-11-10',text:'b'}],labels:[],
      events:[{id:'fruit__t1',deptId:'fruit',cardId:'fruit__c1',label:'L',start:ts(T),end:ts(T+3600e3),startRaw:5,endRaw:{},allDay:false,place:'',toIssue:false},
              {id:'fruit__t2',deptId:'fruit',cardId:'fruit__c1',label:'L',start:ts(T),end:ts(T),startRaw:'2026-11-20T10:00',endRaw:'',allDay:false}],legacy:[]};
    let s,err='';try{s=normalize(StoreMap.toState('fruit',src))}catch(e){err=String(e&&e.message)}
    if(err)return {err};
    const c=s.events[0],i=s.issues[0];
    return {err,times:c.times.map(t=>[t.start,t.end]),touched:c.touched,roundAt:c.roundAt||'',staff:c.staff,i:[i.start,i.end,i.doneAt,i.tags.length,i.markers.length,i.markers[0]&&i.markers[0].date],
      w:s.weeks.map(w=>w.date).sort(),rb:s.reportBase&&s.reportBase.date,range:typeof s.range.start,docs:s.docs.length,follows:s.follows.length};
  });
  ok(!B.err,`B Firestore 讀回來的欄位型別不對時不丟例外（${B.err||'沒有例外'}）`);
  if(!B.err){
    ok(JSON.stringify(B.times)===JSON.stringify([['2026-11-20 10:00','2026-11-20 11:00'],['2026-11-20T10:00','']]),`B 時間文字不合格式時照時間戳記排、合格的照原本輸入的（${JSON.stringify(B.times)}）`);
    ok(B.touched.length===0&&B.roundAt===''&&B.staff.length===0,'B 卡片的更新紀錄、分段時刻、專員換成空的');
    ok(B.i[0]===''&&B.i[1]===''&&B.i[2]===null&&B.i[3]===0&&B.i[4]===1&&B.i[5]==='','B 議題的期間、結案日期、階段、處理紀錄整理過');
    ok(B.w.join('|')==='|2026-11-10'&&B.rb===''&&B.range==='string'&&B.docs===0&&B.follows===0,'B 週報日期、週報基準、甘特圖範圍、文件、追蹤整理過');
  }

  /* ---------- C 輸出跳脫：不經整理，直接放進畫面資料 ---------- */
  const C=await p.evaluate(([MARK,LIT])=>{
    const keep=state;const s=JSON.parse(JSON.stringify(state));
    s.weeks=[{id:'wA',date:MARK,text:'a'},{id:'wB',date:MARK,text:'b'}];
    const it={id:'iA',title:'議題A',tags:['規劃'],cur:0,staff:[],labels:[],links:[],note:'',start:MARK,end:MARK,doneAt:null,
      markers:[{id:'m1',date:MARK,text:'一',at:20},{id:'m2',date:MARK,text:'二',at:60,stage:'規劃'}]};
    const dn={...JSON.parse(JSON.stringify(it)),id:'iD',title:'議題D',doneAt:MARK};
    s.issues=[it,dn];state=s;
    const box=document.createElement('div');document.body.append(box);
    const out={};const lit=t=>LIT.some(x=>t.includes(x));const put=(k,html)=>{box.innerHTML=html;out[k]={n:box.querySelectorAll('.fdx').length,lit:lit(box.textContent)}};
    let err='';
    try{
      const wl=document.createElement('div');wl.innerHTML=repHTML(wkStart(state.weeks[0].date));out.weeks={n:wl.querySelectorAll('.fdx').length,lit:lit(wl.textContent)};
      renderGantt();const g=document.querySelector('#gantt');out.gantt={n:g.querySelectorAll('.fdx').length,lit:lit(g.textContent)};
      put('detail',cardHTML(it));put('marker',markerHTML(it.markers[0],null,it));put('log',logHTML(it));
      put('done',doneCardHTML('iD',true));put('doneFields',doneFieldsHTML(dn,false));
    }catch(e){err=String(e&&e.message)}
    box.remove();state=keep;render();
    return {err,out,total:document.querySelectorAll('.fdx').length};
  },[MARK,LIT]);
  ok(!C.err,`C 畫面函式照常執行（${C.err||'沒有例外'}）`);
  for(const [k,t] of [['weeks','週報清單'],['gantt','甘特圖'],['detail','議題詳情'],['marker','甘特圖上的處理紀錄'],['log','處理紀錄清單'],['done','完成紀錄'],['doneFields','完成紀錄的欄位']]){
    const r=(C.out||{})[k];ok(!!r&&r.n===0&&r.lit,`C ${t}：沒有多出元素、字串照字面顯示（${r?r.n:'沒畫'}）`);
  }
  ok(C.total===0&&!p.errs.length,`C 畫面上沒有殘留、沒有錯誤（${p.errs.join('；')||'無'}）`);
  await p.context().close();

  /* 秘書處的各部門週報 */
  const q=await mk('?d=secretariat');
  const D=await q.evaluate(([MARK,LIT])=>{
    const lit=t=>LIT.some(x=>t.includes(x));
    if(typeof renderWeekRead!=='function'||!CFG.meeting)return {skip:true};
    const data=id=>normalize({title:id,weeks:[{id:'w1',date:'2026-11-10',text:'內容一'},{id:'w2',date:'2026-11-03',text:'內容二'}]});
    MT.depts.clear();MT.loading=false;
    for(const id of ['marketing','finance']){const d=data(id);d.weeks.forEach(w=>{w.date=MARK});MT.depts.set(id,{id,name:id,data:d})}
    const body=document.querySelector('#wkBody');const r={};
    WK.dept='all';renderWeekRead();r.all={n:body.querySelectorAll('.fdx').length,lit:lit(body.textContent)};
    WK.dept='marketing';renderWeekRead();r.one={n:body.querySelectorAll('.fdx').length,lit:lit(body.textContent),tabs:body.querySelectorAll('.wk-w').length};
    return r;
  },[MARK,LIT]);
  if(D.skip)ok(false,'D 秘書處頁面沒有各部門週報');
  else{
    ok(D.all.n===0&&D.all.lit,`D 各部門週報「全部最新」：沒有多出元素、字串照字面顯示（${D.all.n}）`);
    ok(D.one.n===0&&D.one.lit&&D.one.tabs===2,`D 單一部門的週報與週次按鈕：沒有多出元素（${D.one.n}，週次 ${D.one.tabs}）`);
  }
  ok(!q.errs.length,`D 沒有錯誤（${q.errs.join('；')||'無'}）`);
  await b.close();
  console.log(fail?`\n有 ${fail} 項失敗`:'\n全部通過');process.exit(fail?1:0);
})();
