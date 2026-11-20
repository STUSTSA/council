/* 工作報告：斷頁由程式決定（2026-11-16 R1，report.js 的 rptPaginate／rptPrintPrep）。桌面 1300、手機 412 各跑一次：
   1. 打開報告：頁數、每張紙的「第 N 頁」、沒有分頁線（.rpt-pb）；手機是整張縮小的 A4（不能左右捲）。
   2. 「工作檢討」打 70 段 → 斷點那一塊被推到下一張紙的開頭（離紙張頂端 14mm）。
   3. 預覽算出「每一頁從哪一塊開始」，跟真的輸出的 PDF（pdftotext 抽每一頁的字）逐頁比對：頁數相同、每一頁開頭就是那一塊；
      PDF 沒有被縮小（右邊對齊的章節索引貼齊內文右緣）、封面以外每頁都有「第 N 頁／共 M 頁」。
   4. 桌面與手機的斷點完全相同。
   5. 桌面：加卡片多久回應、打字時捲動不跳。手機：點進文字圖塊，工具列與段落小工具搬到畫面底部。
   固定 8300 埠；需要 pdftotext（poppler-utils） */
const c=require('./common');const {execFileSync}=require('child_process');const fs=require('fs');
const strip=s=>s.replace(/\s+/g,'');
const pdfPages=buf=>{fs.writeFileSync('rp2_out.pdf',buf);return execFileSync('pdftotext',['-enc','UTF-8','rp2_out.pdf','-']).toString().split('\f').slice(0,-1).map(strip)};
const pdfMaxX=()=>{const x=execFileSync('pdftotext',['-bbox','rp2_out.pdf','-']).toString();return Math.max(...[...x.matchAll(/xMax="([\d.]+)"/g)].map(m=>+m[1]))};
let bad=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)bad++};
(async()=>{const res={};
for(const [tag,w,h,touch] of [['desktop',1300,900,false],['mobile',412,915,true]]){
  console.log('==',tag,w);
  const {b,mk,login}=await c.setup();   /* 每種寬度各自一份測試資料（第二次登入會變成選身分） */
  const p=await mk(w,h,'light',touch);await login(p);
  await p.evaluate(()=>openReport(addDays(today(),-90),today()));await p.waitForTimeout(1800);
  const st=()=>p.evaluate(()=>({pages:$('#rptPages').textContent,pg:document.querySelectorAll('.rpt-pg').length,gaps:document.querySelectorAll('.rpt-gap').length,sp:document.querySelectorAll('.rpt-sp').length,pb:document.querySelectorAll('.rpt-pb').length,measure:!!document.querySelector('.rpt-measure'),foot:document.querySelectorAll('.rpt-foot,.rpt-fill,.rpt-brk').length}));
  console.log('open',JSON.stringify(await st()));
  const fit=await p.evaluate(()=>{const f=$('.rpt-fit'),pp=$('.rpt-paper'),sc=$('#rptOv .rpt-scroll');return {fit:f.classList.contains('is-fit'),k:+(pp.getBoundingClientRect().width/pp.offsetWidth).toFixed(3),paperW:pp.offsetWidth,hscroll:sc.scrollWidth>sc.clientWidth+1}});
  console.log('fit',JSON.stringify(fit));ok(fit.paperW>=793&&!fit.hscroll&&(tag==='mobile'?fit.fit&&fit.k<.6:!fit.fit),'紙張是 A4 寬'+(tag==='mobile'?'、整張縮小、不能左右捲':'、沒有縮小'));
  await p.evaluate(()=>{const t=document.querySelector('.rpt-ch[data-k=free] .rpt-text');
    t.innerHTML=Array.from({length:70},(_,i)=>`<p>第 ${i+1} 段：這是一段很長的工作檢討文字，用來測試報告換頁的位置是不是跟實際存成 PDF 的時候一樣，換行也要一樣。</p>`).join('');t.dispatchEvent(new Event('input',{bubbles:true}))});
  await p.waitForTimeout(900);const s2=await st();console.log('long text',JSON.stringify(s2));ok(s2.pb===0&&s2.foot===0&&!s2.measure,'沒有分頁線、預覽裡沒有列印用的頁碼與強制換頁');
  const top=await p.evaluate(()=>[...document.querySelectorAll('.rpt-sp')].map(sp=>{const sec=sp.closest('.rpt-page'),el=sp.nextElementSibling,k=sec.getBoundingClientRect().height/sec.offsetHeight,y=(el.getBoundingClientRect().top-sec.getBoundingClientRect().top)/k,A4=rptPageH.A4+28;return +((y%A4)/rptPageH.top*14).toFixed(1)}));
  console.log('pushed to sheet top (mm)',top.join(' '));ok(top.length&&top.every(v=>v>=13.4&&v<=14.4),'斷點那一塊在下一張紙離頂端 14mm');
  await p.evaluate(()=>{const s=document.querySelector('.rpt-sp');s&&s.scrollIntoView({block:'center'})});await p.waitForTimeout(300);await p.screenshot({path:`rp2_${tag}_sheet.png`});
  /* 每一頁從哪一塊開始：區塊的開頭字（章的第一頁用章名、封面用標題） */
  const sigs=()=>p.evaluate(()=>rptPlan.map(x=>{const t=s=>s.replace(/\s+/g,'');
    if(x.el===x.sec){const h=x.sec.querySelector('h1,h2');return {sec:1,s:t(h.textContent).slice(0,8)}}
    return {s:t(x.el.textContent).slice(0,12),cut:x.cut}}));
  const pre=await sigs();console.log('preview pages',pre.length,pre.map(x=>x.s).join(' | '));
  /* 真的輸出 PDF：跟按「存成 PDF」一樣先 rptPrintPrep */
  await p.evaluate(()=>rptPrintPrep());const prn=await sigs();
  ok(JSON.stringify(prn)===JSON.stringify(pre),'列印前用列印的樣子重算，斷點跟預覽一樣');
  await p.emulateMedia({media:'print'});const pages=pdfPages(await p.pdf({format:'A4',preferCSSPageSize:true,printBackground:true}));await p.emulateMedia({media:'screen'});
  const maxX=pdfMaxX();console.log('pdf pages',pages.length,'max x',maxX.toFixed(1),'pt (內文右緣 555.6)');
  ok(pages.length===pre.length,`頁數相同（預覽 ${pre.length}、PDF ${pages.length}）`);
  ok(maxX>550&&maxX<557,'PDF 沒有被縮小、沒有超出紙寬');
  const miss=pre.map((x,i)=>{const pg=pages[i]||'';return (x.sec?pg.slice(0,40).includes(x.s):pg.startsWith(x.s))?null:`第${i+1}頁 預覽「${x.s}」PDF「${pg.slice(0,16)}」`}).filter(Boolean);
  ok(!miss.length,'每一頁從哪一塊開始，預覽與 PDF 相同'+(miss.length?'：'+miss.join('；'):''));
  const nf=pages.map((pg,i)=>i===0?!/頁／共/.test(pg):pg.includes(`第${i+1}頁／共${pages.length}頁`)).filter(x=>!x).length;
  ok(!nf,'封面不印頁碼，其他每頁都有「第 N 頁／共 M 頁」'+(nf?`（${nf} 頁不對）`:''));
  /* 印完：使用者回到畫面上操作才排回來 */
  await p.evaluate(()=>{dispatchEvent(new Event('afterprint'));dispatchEvent(new PointerEvent('pointerdown'))});await p.waitForTimeout(400);
  const s3=await st();ok(s3.foot===0&&s3.pages===s2.pages,'印完排回來（拿掉列印用的頁碼與強制換頁）');
  res[tag]=pre.map(x=>x.s);
  if(tag==='desktop'){
    const ch=await p.$('.rpt-ch:last-of-type [data-ins=cards]');await ch.scrollIntoViewIfNeeded();await ch.click();await p.waitForTimeout(700);
    const t0=Date.now();await p.click('.rpt-ch:last-of-type [data-cadd]',{timeout:5000}).catch(e=>console.log('cadd click fail',e.message.split('\n')[0]));const dt=Date.now()-t0;await p.waitForTimeout(800);
    console.log('cadd',dt,'ms cards',await p.evaluate(()=>document.querySelectorAll('.rpt-ch:last-of-type .rpt-card').length));
    const y0=await p.evaluate(()=>$('#rptOv .rpt-scroll').scrollTop);await p.keyboard.type('測試卡片名稱');await p.waitForTimeout(900);const y1=await p.evaluate(()=>$('#rptOv .rpt-scroll').scrollTop);
    ok(Math.abs(y1-y0)<2,`打字時捲動不跳（${y0} → ${y1}）`);
  }else{
    const tx=await p.$('.rpt-ch[data-k=free] .rpt-text');await tx.scrollIntoViewIfNeeded();await tx.tap();await p.waitForTimeout(500);
    const dock=await p.evaluate(()=>{const bt=document.querySelector('.rpt-ov>.rpt-bt.is-dock'),pt=document.querySelector('.rpt-ov>.rpt-pt:not([hidden])'),r=bt&&bt.getBoundingClientRect(),q=pt&&pt.getBoundingClientRect();
      return {bt:!!bt,btBottom:r&&Math.round(innerHeight-r.bottom),btH:r&&Math.round(r.height),pt:!!pt,ptAbove:!!(q&&r&&q.bottom<=r.top),btn:bt&&[...bt.querySelectorAll('button')].map(b=>b.textContent).join('/')}});
    console.log('dock',JSON.stringify(dock));ok(dock.bt&&dock.btBottom>=0&&dock.btBottom<40&&dock.btH>=30&&dock.pt&&dock.ptAbove,'點進文字圖塊：工具列在畫面底部（原本大小），段落小工具在它上面');
    await p.screenshot({path:`rp2_${tag}_dock.png`});
    await p.tap('.rpt-ov>.rpt-bt.is-dock [data-bmv="-1"]');await p.waitForTimeout(500);
    ok(await p.evaluate(()=>!!document.querySelector('.rpt-ov>.rpt-bt.is-dock')),'按工具列（上移）之後圖塊還是選取中');
    await p.evaluate(()=>document.activeElement.blur());await p.waitForTimeout(300);
    ok(await p.evaluate(()=>!document.querySelector('.rpt-ov>.rpt-bt')&&document.querySelectorAll('.rpt-blk>.rpt-bt').length===document.querySelectorAll('.rpt-blk').length),'離開圖塊後工具列搬回圖塊裡');
  }
  console.log('errs',JSON.stringify(p.errs));if(p.errs.length)bad++;
  await b.close();
}
ok(JSON.stringify(res.desktop)===JSON.stringify(res.mobile),'桌面與手機的斷點完全相同');
console.log(bad?`FAIL ${bad}`:'ALL OK');process.exit(bad?1:0)})();
