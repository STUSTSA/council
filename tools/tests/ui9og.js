/* ui9og：分享預覽統一（ui-09 N；DESIGN-next 第一節「分享預覽」）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   1. 原始檔（不跑 JS，用 Node 讀 index.html、home.html）：兩頁的 og:title＝「學生會數位系統」、og:image＝https://stustsa.github.io/council/dept/cover.png（完整網址、https）、
      og:description、og:site_name、og:type、og:image:width／height、twitter:card／title／description／image 兩頁完全一樣；name="description" 跟 og:description 同一句；
      og:image:width／height 等於 dept/cover.png 實際寬高（讀 PNG 檔頭）；og:url 各寫自己的完整網址（index.html＝…/council/、home.html＝…/council/home.html）
   2. index.html 的靜態 <title>（爬蟲不跑 JS，所有部門的連結都拿到這個）＝「學生會數位系統」、不含任何部門名稱（從 dept/config.js 的 BOARD_DEPTS 讀，含測試部門）
   3. Playwright 開兩頁（index.html 也開 ?d=marketing）：跑完 JS 後 og／twitter 標籤跟原始檔一樣（執行中沒有被改掉）
   4. 設定 → 網站管理（後台管理員、已登入）沒有「分享預覽」入口；頁面上沒有 shareSettings、metaSet、metaGet
   失敗會印 FAIL 並以非 0 結束 */
const fs=require('fs'),path=require('path'),vm=require('vm');
const {setup}=require('./common.js');
const ROOT=path.join(__dirname,'../..'),U='http://127.0.0.1:8300/';
const TITLE='學生會數位系統',IMG='https://stustsa.github.io/council/dept/cover.png';
const OWN_URL={'index.html':'https://stustsa.github.io/council/','home.html':'https://stustsa.github.io/council/home.html'};
const KEYS=['og:type','og:site_name','og:title','og:description','og:image','og:image:width','og:image:height','twitter:card','twitter:title','twitter:description','twitter:image'];
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const W=ms=>new Promise(r=>setTimeout(r,ms));

/* head 裡的 meta：{property 或 name: content}（同一個鍵出現兩次記成陣列，下面會斷言沒有重複） */
const metas=html=>{const head=(html.match(/<head>([\s\S]*?)<\/head>/i)||[])[1]||'',o={},dup=[];
  for(const m of head.matchAll(/<meta\s+([^>]*?)\/?>/gi)){const a=m[1],k=(a.match(/(?:property|name)="([^"]+)"/)||[])[1],c=(a.match(/content="([^"]*)"/)||[])[1];
    if(!k||c==null)continue;if(k in o)dup.push(k);o[k]=c}
  return {o,dup,title:((head.match(/<title>([^<]*)<\/title>/i)||[])[1]||'').trim()}};
const png=f=>{const b=fs.readFileSync(f);return b.slice(1,4).toString()==='PNG'?{w:b.readUInt32BE(16),h:b.readUInt32BE(20)}:null};

(async()=>{
  /* ---------- 1、2 原始檔 ---------- */
  const src={};for(const f of ['index.html','home.html'])src[f]=metas(fs.readFileSync(path.join(ROOT,f),'utf8'));
  const I=src['index.html'],H=src['home.html'],sz=png(path.join(ROOT,'dept/cover.png'));
  for(const [f,s] of Object.entries(src)){
    ok(!s.dup.length,`${f}：og／twitter／description 沒有重複的標籤（${s.dup.join('、')||'無'}）`);
    ok(KEYS.every(k=>s.o[k]),`${f}：og／twitter 標籤齊全（缺 ${KEYS.filter(k=>!s.o[k]).join('、')||'無'}）`);
    ok(s.o['og:title']===TITLE&&s.o['twitter:title']===TITLE,`${f}：og:title、twitter:title＝「${TITLE}」（${s.o['og:title']}、${s.o['twitter:title']}）`);
    ok(s.o['og:image']===IMG&&s.o['twitter:image']===IMG,`${f}：og:image、twitter:image 是完整的 https 網址、指到 dept/cover.png（${s.o['og:image']}）`);
    ok(sz&&s.o['og:image:width']===String(sz.w)&&s.o['og:image:height']===String(sz.h),`${f}：og:image:width／height＝cover.png 實際尺寸（${s.o['og:image:width']}×${s.o['og:image:height']}，檔案 ${sz&&sz.w}×${sz&&sz.h}）`);
    ok(s.o['og:url']===OWN_URL[f],`${f}：og:url 是自己的完整網址（${s.o['og:url']}）`);
    ok(s.o.description&&s.o.description===s.o['og:description']&&s.o['og:description']===s.o['twitter:description'],`${f}：description、og:description、twitter:description 同一句（${s.o.description}）`);
    ok(s.o['twitter:card']==='summary_large_image'&&s.o['og:type']==='website',`${f}：twitter:card＝summary_large_image、og:type＝website`);
  }
  const diff=KEYS.concat('description').filter(k=>I.o[k]!==H.o[k]);
  ok(!diff.length,`兩頁的 og／twitter／description 全部一致（不一樣的：${diff.map(k=>`${k}：${I.o[k]}｜${H.o[k]}`).join('；')||'無'}）`);
  /* 部門名稱：dept/config.js 在 Node 裡跑（給它假的 location、window） */
  const ctx={location:{search:''},window:{},URLSearchParams};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'dept/config.js'),'utf8')+';this.__D=BOARD_DEPTS',ctx);
  const names=(ctx.__D||[]).map(d=>d.name);
  ok(names.length>=9,`從 dept/config.js 讀到部門名稱（${names.join('、')}）`);
  ok(I.title===TITLE&&!names.some(n=>I.title.includes(n)),`index.html 的靜態 <title>＝「${TITLE}」、不含部門名稱（${I.title}）`);

  /* ---------- 3、4 執行中 ---------- */
  const {b,mk,login}=await setup();
  {const p=await mk(1300,860,'light',false);
    const live=()=>p.evaluate(K=>Object.fromEntries(K.concat('description','og:url').map(k=>[k,(document.querySelector(`meta[property="${k}"],meta[name="${k}"]`)||{}).content||''])),KEYS);
    let m=await live();let bad=KEYS.concat('description','og:url').filter(k=>m[k]!==I.o[k]);
    ok(!bad.length,`index.html 跑完 JS 後 og／twitter 標籤沒有被改掉（${bad.map(k=>k+'＝'+m[k]).join('；')||'都跟原始檔一樣'}）`);
    /* 4. 網站管理沒有「分享預覽」 */
    await login(p);await p.evaluate(()=>{localStorage.setItem('workboard:siteadmin','1')});
    await p.click('#setBtn');await W(900);
    const rows=await p.evaluate(()=>[...document.querySelectorAll('#setOv .set-inner .set-row')].map(r=>r.dataset.set));
    ok(rows.includes('site'),`後台管理員看得到「網站管理」（${rows.join('、')}）`);
    await p.click('#setOv [data-set="site"]');await W(1000);
    const hub=await p.evaluate(()=>{const pn=document.querySelector('#setOv .set-pane');return {k:[...pn.querySelectorAll('.set-hub:not([hidden]) [data-hub]')].map(x=>x.dataset.hub),t:pn.textContent,
      fn:['shareSettings','metaSet','metaGet'].filter(n=>{try{return typeof eval(n)!=='undefined'}catch(_){return false}})}});
    ok(hub.k.includes('cloud')&&!hub.k.includes('share')&&!/分享預覽/.test(hub.t),`設定 → 網站管理沒有「分享預覽」入口（${hub.k.join('、')}）`);
    ok(!hub.fn.length,`頁面上沒有 shareSettings、metaSet、metaGet（還在的：${hub.fn.join('、')||'無'}）`);
    m=await live();bad=KEYS.concat('description','og:url').filter(k=>m[k]!==I.o[k]);
    ok(!bad.length,`登入、開設定後 og／twitter 標籤仍跟原始檔一樣（${bad.map(k=>k+'＝'+m[k]).join('；')||'一樣'}）`);
    ok(!p.errs.length,'index.html 沒有錯誤 '+p.errs.join(' | '));
    await p.context().close()}
  for(const [f,q] of [['index.html','?d=marketing'],['home.html','']]){
    const ctx2=await b.newContext({viewport:{width:412,height:860},serviceWorkers:'block'});
    await ctx2.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await ctx2.route('https://api.github.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
    const p=await ctx2.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(U+f+q);await W(2000);
    const m=await p.evaluate(K=>Object.fromEntries(K.map(k=>[k,(document.querySelector(`meta[property="${k}"],meta[name="${k}"]`)||{}).content||''])),KEYS.concat('description','og:url'));
    const bad=KEYS.concat('description','og:url').filter(k=>m[k]!==src[f].o[k]);
    ok(!bad.length,`${f}${q} 跑完 JS 後 og／twitter 標籤沒有被改掉（${bad.map(k=>k+'＝'+m[k]).join('；')||'都跟原始檔一樣'}）`);
    ok(!errs.length,`${f}${q} 沒有錯誤 `+errs.join(' | '));
    await ctx2.close()}
  await b.close();
  console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL 例外',e);process.exit(1)});
