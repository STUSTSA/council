// 工作報告第一步：預設排版（本期重點、議題進度表、下期規劃表、附錄）與三款封面；桌面與手機各截圖
// 用法：在暫存複本開 python3 -m http.server 8300（data_test.json 改名 data.json），OUT=截圖資料夾 node rp3.js
const C=require('./common');const fs=require('fs');
const OUT=process.env.OUT||'.';
const A=(ok,m)=>{if(!ok){console.log('FAIL:',m);process.exitCode=1}};
(async()=>{const T=await C.setup();
for(const [w,h,tag,sc,touch] of [[1300,1250,'desk','light',false],[412,915,'mob','light',true]]){
  const p=await T.mk(w,h,sc,touch);
  await p.evaluate(()=>openReport('2026-09-07','2026-11-05'));await p.waitForTimeout(1500);
  const r=await p.evaluate(()=>({secs:[...document.querySelectorAll('.rpt-ch')].map(c=>c.querySelector('h2').textContent),
    lead:document.querySelector('.rpt-lead').textContent,stats:[...document.querySelectorAll('.rpt-stats b')].map(b=>b.textContent),
    rows:document.querySelectorAll('.rpt-tbl[data-t=issue] .rpt-tr:not(.rpt-th)').length,
    pages:document.getElementById('rptPages').textContent,cv:document.querySelector('.rpt-cover').dataset.cv}));
  console.log(tag,JSON.stringify(r));
  A(r.secs.join()==='本期重點與議題進度,檢討、需要支援與下期規劃,附錄：期間時程與處理經過',tag+' chapters '+r.secs);
  A(r.rows===4,tag+' issue rows');A(/^共 4 件議題/.test(r.lead),tag+' lead');
  const sc2=async name=>{const el=await p.$(name);await el.scrollIntoViewIfNeeded();await p.waitForTimeout(250)};
  for(const cv of ['band','curve','stripe']){
    await p.evaluate(()=>document.querySelector('.rpt-scroll').scrollTo(0,0));
    await p.evaluate(k=>document.querySelector('[data-cvs='+k+']').click(),cv);await p.waitForTimeout(250);
    A(await p.evaluate(()=>document.querySelector('.rpt-cover').dataset.cv)===cv,tag+' cover '+cv);
    const el=await p.$('.rpt-cover');
    await el.screenshot({path:`${OUT}/rpt_${tag}_cover_${cv}.png`});
  }
  await p.evaluate(()=>document.querySelector('[data-cvs=band]').click());
  for(const [k,n] of [['sum','sum'],['free','plan'],['app','app']]){
    const sel='.rpt-ch[data-k='+k+']';
    await p.evaluate(s=>{const e=document.querySelector(s)||document.querySelectorAll('.rpt-ch')[3];e.scrollIntoView({block:'start'})},sel);await p.waitForTimeout(300);
    await p.screenshot({path:`${OUT}/rpt_${tag}_${n}.png`});
  }

  /* --- 圖片：加一張（畫布畫的漸層圖）、拖曳移動、角縮放、淡出，前後各截圖 --- */
  const ch=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,1200,800);gr.addColorStop(0,'#1d4ed8');gr.addColorStop(.5,'#f59e0b');gr.addColorStop(1,'#dc2626');g.fillStyle=gr;g.fillRect(0,0,1200,800);g.fillStyle='rgba(255,255,255,.85)';g.beginPath();g.arc(600,400,220,0,7);g.fill();
    const sec=document.querySelectorAll('.rpt-ch')[1];sec.querySelector('.rpt-blocks').insertAdjacentHTML('beforeend',rptImgBlk(c.toDataURL('image/jpeg',.9),c.height/c.width));const b=sec.querySelector('.rpt-blk[data-blk=img]');rptImgSync(b.querySelector('.rpt-img'));rptPaginateSoon();return 1});
  await p.waitForTimeout(600);
  const fig='.rpt-img',st=()=>p.evaluate(()=>{const f=document.querySelector('.rpt-img'),g=k=>parseFloat(f.style.getPropertyValue('--'+k)),b=f.querySelector('.rpt-img-box').getBoundingClientRect(),fr=f.querySelector('.rpt-img-frame').getBoundingClientRect();return {w:g('w'),x:g('x'),y:g('y'),far:g('far'),ratio:b.height/b.width,inside:b.left>=fr.left-1&&b.right<=fr.right+1&&b.top>=fr.top-1&&b.bottom<=fr.bottom+1}});
  const blkEl=await p.$('.rpt-blk[data-blk=img]');await blkEl.scrollIntoViewIfNeeded();await p.evaluate(()=>document.querySelector('.rpt-blk[data-blk=img]').focus({preventScroll:true}));await p.waitForTimeout(300);
  const s0=await st();console.log(tag,'img0',JSON.stringify(s0));
  await blkEl.screenshot({path:`${OUT}/rpt_${tag}_img_before.png`});
  const drag=async(sel,dx,dy)=>{const r=await (await p.$(sel)).boundingBox(),cx=r.x+r.width/2,cy=r.y+r.height/2;
    if(touch){await p.evaluate(([cx,cy,dx,dy,sel])=>{const el=document.querySelector(sel),f=(t,x,y)=>(t==='pointerdown'?el:window).dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'touch',pointerId:7,isPrimary:true}));f('pointerdown',cx,cy);for(let i=1;i<=6;i++)f('pointermove',cx+dx*i/6,cy+dy*i/6);f('pointerup',cx+dx,cy+dy)},[cx,cy,dx,dy,sel])}
    else{await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+dx/2,cy+dy/2,{steps:4});await p.mouse.move(cx+dx,cy+dy,{steps:4});await p.mouse.up()}
    await p.waitForTimeout(450)};
  const k=await p.evaluate(()=>document.querySelector('.rpt-img-frame').getBoundingClientRect().width/100);
  await drag('.rpt-img-box img',-30*k,0);const s1=await st();console.log(tag,'moved',JSON.stringify(s1));
  A(s1.x<s0.x-10&&s1.inside,tag+' drag moves image left and stays inside frame');
  await drag('.rpt-img-h[data-h=br]',-12*k,0);const s2=await st();console.log(tag,'resized',JSON.stringify(s2));
  A(s2.w<s1.w-5&&Math.abs(s2.ratio-0.6667)<.02&&s2.inside,tag+' corner resize keeps ratio and frame');
  await drag('.rpt-img-h[data-h=fh]',0,12*k);const s3=await st();console.log(tag,'frame h',JSON.stringify(s3));
  A(s3.far>s2.far+.05,tag+' frame height grows');
  await drag('.rpt-img-box img',0,5*k);
  await p.evaluate(()=>{document.querySelector('[data-fd=all]').click()});await p.waitForTimeout(400);
  const mk=await p.evaluate(()=>getComputedStyle(document.querySelector('.rpt-img img')).maskImage||getComputedStyle(document.querySelector('.rpt-img img')).webkitMaskImage);A(/gradient/.test(mk),tag+' fade mask applied');
  await p.evaluate(()=>document.querySelector('.rpt-blk[data-blk=img]').focus({preventScroll:true}));
  await blkEl.screenshot({path:`${OUT}/rpt_${tag}_img_after.png`});
  await drag('.rpt-img-box img',-80*k,-80*k);const s4=await st();A(s4.inside&&s4.x>=-.01&&s4.y>=-.01,tag+' over-drag is clamped '+JSON.stringify(s4));
  A(await p.evaluate(()=>!!document.querySelector('.rpt-img').closest('.rpt-page')),tag+' image stays in page');
  if(tag==='desk'){   /* 真的輸出 PDF（跟按「存成 PDF」一樣）：圖片與封面圖案要印得出來 */
    await p.evaluate(()=>rptPrintPrep());await p.emulateMedia({media:'print'});fs.writeFileSync(`${OUT}/rpt_sample.pdf`,await p.pdf({format:'A4',preferCSSPageSize:true,printBackground:true}));await p.emulateMedia({media:'screen'});
    const txt=require('child_process').execFileSync('pdftotext',['-enc','UTF-8',`${OUT}/rpt_sample.pdf`,'-']).toString();A(/本期重點與議題進度/.test(txt)&&/下期規劃/.test(txt),'pdf has chapters');
  }
  A(!p.errs.length,tag+' errors '+p.errs.join('|'));
  await p.context().close();
}
await T.b.close()})();
