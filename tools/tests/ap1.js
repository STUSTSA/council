/* ap1：活動部的「進度」頁畫面叫「專案」（core/js/config.js 的 ISS；資料仍是議題 issues，其他部門不變）。
   檢查：活動部分頁名、標題、「+ 專案」鈕、新增的預設名稱、甘特圖欄名、搜尋分區名；權益部照舊「進度」「議題」；專案名稱裡的 HTML 要被跳脫。
   截圖：桌面、手機（SHOTS 指定輸出資料夾） */
const c=require('./common');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const dir=process.env.SHOTS||'.';
for(const [d,tab,word] of [['events','專案','專案'],['rights','進度','議題']].filter(x=>!process.env.ONLY||x[0]===process.env.ONLY)){
 c.q='?d='+d;const {b,mk,login}=await c.setup(__dirname+'/data_test.json');
 for(const [w,h,sc,touch,tag] of [[1366,800,'light',false,'desk'],[390,780,'dark',true,'mob']]){
  const p=await mk(w,h,sc,touch);await login(p);
  await p.evaluate(()=>setSection('progress',{instant:true}));await p.waitForTimeout(700);
  ok(await p.$$eval('.tabbar button, #tabs button, nav button',x=>x.some(e=>e.textContent.trim()==='專案'||e.textContent.trim()==='進度')),d+' '+tag+'：有分頁');
  ok((await p.$eval('#ganttH',e=>e.textContent))===tab,d+' '+tag+'：標題「'+tab+'」');
  ok((await p.$eval('#addIssue',e=>e.textContent.trim()))===word,d+' '+tag+'：新增鈕「+ '+word+'」');
  ok((await p.$eval('#pvGantt .g-name.sub',e=>e.textContent.trim()))===word,d+' '+tag+'：甘特圖欄名');
  if(tag==='desk'){
   await p.click('#addIssue');await p.waitForTimeout(900);
   const v=await p.$eval('[data-iname]',e=>e.value).catch(()=>null);
   ok(v==='新'+word,d+'：新增預設名稱「新'+word+'」：'+v);
   await p.fill('[data-iname]','<img src=x onerror=window.__x=1>活動');await p.keyboard.press('Enter');await p.waitForTimeout(1200);
   ok(!(await p.evaluate(()=>window.__x)),d+'：名稱裡的 HTML 被跳脫');
  }
  if(d==='events')await p.screenshot({path:`${dir}/ap_${tag}.png`});
  ok(!p.errs.length,d+' '+tag+'：沒有錯誤 '+p.errs.slice(0,2).join('|'));
  await p.context().close();
 }
 await b.close();
}
process.exit(bad?1:0)})();
