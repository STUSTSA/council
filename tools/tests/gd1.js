/* 使用說明（設定 →「使用說明」，core/js/guide.js）：不用登入就看得到；七項教學（即時回報卡片、進度與專案、看過期的事、看今天要處理的事、完成紀錄、產生每週報告、產生工作報告）；
   示範會自己播（畫面會變、手指出現）；練習照題目做完顯示「練習完成」；練習的內容不進 state、不打 GitHub API；名稱輸入 HTML 不會變成節點。
   手機 412 與桌面 1366；截圖寫到 OUT（預設 /tmp/gd1）。準備：照 CLAUDE.md 開 8300，在 tools/tests/ 執行 node gd1.js */
const c=require('./common.js'),fs=require('fs');const OUT=process.env.OUT||'/tmp/gd1';fs.mkdirSync(OUT,{recursive:true});
let bad=0;const ok=(v,t)=>{console.log((v?'ok   ':'FAIL ')+t);if(!v)bad++};
const tip=p=>p.evaluate(()=>(document.querySelector('.gd-tip')||{}).textContent||'');
const mid=async(p,sel)=>{const b=await p.locator(sel).first().boundingBox();return [b.x+b.width/2,b.y+b.height/2]};
const drag=async(p,sel,dx,dy)=>{const [x,y]=await mid(p,sel);await p.mouse.move(x,y);await p.mouse.down();for(let i=1;i<=12;i++){await p.mouse.move(x+dx*i/12,y+dy*i/12);await p.waitForTimeout(16)}await p.mouse.up();await p.waitForTimeout(700)};
const toCorner=async(p,sel,right)=>{const s=await p.locator('.gd-stage').boundingBox(),[x,y]=await mid(p,sel);await drag(p,sel,(right?s.x+s.width-50:s.x+50)-x,s.y+50-y)};
(async()=>{const {b,mk,st}=await c.setup();
for(const [name,w,h,touch] of [['m',412,880,true],['d',1366,768,false]]){
  const p=await mk(w,h,'light',touch);const host=touch?'#setSub':'#setOv .set-pane';
  const before=await p.evaluate(()=>JSON.stringify(state));
  await p.click('#setBtn');await p.waitForTimeout(900);
  ok(await p.locator('#setOv [data-set=guide]').count()===1,name+' 沒登入也有「使用說明」一列');
  await p.click('#setOv [data-set=guide]');await p.waitForTimeout(900);
  ok(await p.locator(host+' [data-gdl]').count()===7,name+' 教學清單七項');
  await p.screenshot({path:`${OUT}/${name}_list.png`});

  /* 1 即時回報卡片 */
  await p.click(host+' [data-gdl=live]');await p.waitForTimeout(600);
  ok((await tip(p)).startsWith('示範'),name+' 進教學先播示範：'+await tip(p));
  await p.waitForTimeout(5200);
  ok(await p.locator('.gd-finger:not([hidden])').count()===1&&await p.locator('.gd-in .gd-cp').count()+await p.locator('.gd-in .gd-card').count()>0,name+' 示範有手指、畫面在動');
  await p.screenshot({path:`${OUT}/${name}_live_demo.png`});
  await p.click('[data-gdmode=practice]');await p.waitForTimeout(500);
  ok((await tip(p)).includes('練習 1／4'),name+' 練習第一題：'+await tip(p));
  await p.click('.gd-in [data-gd=fab]');await p.waitForTimeout(400);await p.screenshot({path:`${OUT}/${name}_live_fab.png`});
  await p.click('.gd-in [data-k=text]');await p.waitForTimeout(400);
  await p.fill('.gd-in [data-gdin=name]','<img src=x onerror=window.__x=1>');await p.screenshot({path:`${OUT}/${name}_live_card.png`});
  await p.click('.gd-in [data-gd=close]');await p.waitForTimeout(500);
  ok(await p.locator('.gd-in .gd-cp').count()===4&&await p.locator('.gd-in img').count()===0&&!(await p.evaluate(()=>window.__x)),name+' 新增一張，名稱裡的 HTML 只當文字');
  ok((await tip(p)).includes('練習 2／4'),name+' 進第二題');
  await p.click('.gd-in .gd-cp >> nth=2');await p.waitForTimeout(400);await p.fill('.gd-in [data-gdin=note]','改過了');await p.click('.gd-in [data-gd=close]');await p.waitForTimeout(500);
  ok((await tip(p)).includes('練習 3／4'),name+' 編輯後進第三題');
  await drag(p,'.gd-in .gd-cp >> nth=3',-20,60);
  ok(await p.locator('.gd-in .gd-cp').count()===4,name+' 沒拖到角落會彈回、不動資料');
  await toCorner(p,'.gd-in .gd-cp >> nth=1',true);
  ok(await p.locator('.gd-in .gd-cp').count()===3&&(await tip(p)).includes('練習 4／4'),name+' 拖到右上角＝完成');
  await toCorner(p,'.gd-in .gd-cp >> nth=1',false);
  ok(await p.locator('.gd-in .gd-ask').count()===1&&await p.locator('.gd-in .gd-cp').count()===3,name+' 拖到左上角先確認');
  await p.screenshot({path:`${OUT}/${name}_live_ask.png`});
  await p.click('.gd-in [data-gd=ask-yes]');await p.waitForTimeout(500);
  ok(await p.locator('.gd-in .gd-cp').count()===2&&(await tip(p)).includes('練習完成'),name+' 確認後刪除，四題做完：'+await tip(p));
  await p.screenshot({path:`${OUT}/${name}_live_done.png`});
  await p.click('[data-gdreset]');await p.waitForTimeout(400);
  ok(await p.locator('.gd-in .gd-cp').count()===3&&(await tip(p)).includes('練習 1／4'),name+' 重來回到原本三張');
  await p.goBack();await p.waitForTimeout(700);
  ok(await p.locator(host+' [data-gdl]').count()===7,name+' 上一頁回到教學清單');

  /* 3 看過期的事 */
  await p.click(host+' [data-gdl=overdue]');await p.waitForTimeout(400);await p.click('[data-gdmode=practice]');await p.waitForTimeout(400);
  await p.click('.gd-in [data-gd=bell]');await p.waitForTimeout(400);await p.screenshot({path:`${OUT}/${name}_overdue_noti.png`});
  await p.click('.gd-in [data-gd=check]');await p.waitForTimeout(500);await p.screenshot({path:`${OUT}/${name}_overdue_pile.png`});
  await drag(p,'.gd-in .gd-pc.top',40,0);
  ok(await p.locator('.gd-in .gd-pc').count()===3,name+' 滑不夠遠會彈回');
  await drag(p,'.gd-in .gd-pc.top',190,0);
  ok(await p.locator('.gd-in .gd-pc').count()===2&&(await tip(p)).includes('練習 4／4'),name+' 往右滑＝完成');
  await drag(p,'.gd-in .gd-pc.top',-190,0);
  ok(await p.locator('.gd-in .gd-pc').count()===1&&(await tip(p)).includes('練習完成'),name+' 往左滑＝改期，做完');
  await p.click('.gd-in [data-gd=p-ok]');await p.waitForTimeout(400);
  ok(await p.locator('.gd-in .gd-none').count()===1,name+' 按鈕也能完成，清完顯示處理完了');
  await p.goBack();await p.waitForTimeout(700);

  /* 4 看今天要處理的事 */
  await p.click(host+' [data-gdl=today]');await p.waitForTimeout(400);
  await p.waitForTimeout(4200);await p.screenshot({path:`${OUT}/${name}_today_demo.png`});
  await p.click('[data-gdmode=practice]');await p.waitForTimeout(400);
  await p.click('.gd-in [data-gd=bell]');await p.waitForTimeout(400);await p.click('.gd-in [data-gd=today]');await p.waitForTimeout(900);
  ok(await p.locator('.gd-in .gd-today li').count()===3,name+' 今日層列出三件事');await p.screenshot({path:`${OUT}/${name}_today.png`});
  await p.click('.gd-in [data-gd=shut]');await p.waitForTimeout(400);
  ok((await tip(p)).includes('練習完成'),name+' 今日教學做完');
  await p.goBack();await p.waitForTimeout(600);

  /* 2 進度與專案 */
  const tap=async sel=>{await p.click('.gd-in '+sel);await p.waitForTimeout(450)};
  await p.click(host+' [data-gdl=prog]');await p.waitForTimeout(400);await p.waitForTimeout(3600);await p.screenshot({path:`${OUT}/${name}_prog_demo.png`});
  await p.click('[data-gdmode=practice]');await p.waitForTimeout(400);
  await tap('[data-gd=new]');await p.fill('.gd-in [data-gdin=title]','<b onclick=1>新議題</b>');await tap('[data-gd=close]');
  ok(await p.locator('.gd-in .gd-row').count()===3&&await p.locator('.gd-in .gd-row b b').count()===0&&(await tip(p)).includes('練習 2／3'),name+' 進度：新增一個議題，名稱只當文字');
  await p.screenshot({path:`${OUT}/${name}_prog.png`});
  await tap('.gd-row >> nth=0');await p.locator('.gd-in .gd-st >> nth=3').click({force:true});await p.waitForTimeout(300);
  ok(await p.locator('.gd-in .gd-st.on').evaluate(e=>e.textContent)==='處理中',name+' 進度：沒按編輯不能改階段');
  await tap('[data-gd=edit]');await tap('.gd-st >> nth=3');await p.screenshot({path:`${OUT}/${name}_prog_edit.png`});await tap('[data-gd=edit]');
  ok((await tip(p)).includes('練習完成'),name+' 進度教學做完');
  await p.goBack();await p.waitForTimeout(600);

  /* 5 完成紀錄 */
  await p.click(host+' [data-gdl=done]');await p.waitForTimeout(400);await p.click('[data-gdmode=practice]');await p.waitForTimeout(400);
  await tap('[data-gd=tab]');await p.screenshot({path:`${OUT}/${name}_done_weeks.png`});await tap('[data-gd=week]');await tap('.gd-dn >> nth=1');
  ok(await p.locator('.gd-in .gd-dnote').count()===1&&(await tip(p)).includes('練習完成'),name+' 完成紀錄：進週、點一項看到內容');
  await p.screenshot({path:`${OUT}/${name}_done.png`});
  await p.goBack();await p.waitForTimeout(600);

  /* 6 每週報告 */
  await p.click(host+' [data-gdl=weekly]');await p.waitForTimeout(400);await p.click('[data-gdmode=practice]');await p.waitForTimeout(400);
  await tap('[data-gd=gen]');await tap('[data-gd=rep]');
  ok(await p.locator('.gd-in .gd-rtext span').count()===8,name+' 每週報告：生成後點開有全文');
  await p.screenshot({path:`${OUT}/${name}_weekly.png`});await tap('[data-gd=copy]');
  ok((await tip(p)).includes('練習完成'),name+' 每週報告教學做完');
  await p.goBack();await p.waitForTimeout(600);

  /* 7 工作報告 */
  await p.click(host+' [data-gdl=report]');await p.waitForTimeout(400);await p.click('[data-gdmode=practice]');await p.waitForTimeout(400);
  await tap('[data-gd=rpt]');await tap('[data-gd=go]');await tap('[data-gd=chap]');
  ok(await p.locator('.gd-in .gd-paper>span').count()===5,name+' 工作報告：預覽、加一章');
  await tap('[data-gd=pdf]');await p.screenshot({path:`${OUT}/${name}_report.png`});
  ok((await tip(p)).includes('練習完成'),name+' 工作報告教學做完');
  await p.goBack();await p.waitForTimeout(600);await p.goBack();await p.waitForTimeout(900);
  ok(await p.locator('.gd-stage').count()===0,name+' 離開後教學畫面收掉');
  ok(await p.evaluate(()=>JSON.stringify(state))===before,name+' 看板資料沒有被練習改到');
  const errs=p.errs.filter(e=>!/404/.test(e));ok(!errs.length,name+' 沒有錯誤：'+errs.join(' | '));
  await p.context().close();
}
ok(!st.commits.length&&!st.api.some(a=>/^PUT/.test(a)),'整個過程沒有寫入（沒有打 GitHub 的 PUT）');
await b.close();console.log(bad?`\n${bad} 項失敗`:'\n全部通過');process.exit(bad?1:0)})();
