/* 設定打開的浮上來過程（換頁動畫期間）要接得住點擊，不能穿過去點到底下的卡片（pagefx.js run 的 tap）。
   打開設定後 0、100、300、600 ms，畫面中央最上面的元素都要在設定層裡；關閉過程中不能落在底下那頁（要是 BODY，不會點到卡片）。
   準備與執行方式見 CLAUDE.md「測試」：node pf1.js（本機 8300 用 data.json）。 */
const C=require('./common.js');
(async()=>{const h=await C.setup();let bad=0;
for(const [w,hh,touch] of [[412,860,true],[1300,800,false]]){
  const p=await h.mk(w,hh,'light',touch);await p.waitForTimeout(1200);
  for(const d of [0,100,300,600]){
    await p.click('#setBtn');await p.waitForTimeout(d);
    const t=await p.evaluate(()=>{const e=document.elementFromPoint(innerWidth/2+60,innerHeight/2);return e&&!!e.closest('#setOv')});
    if(!t){bad++;console.log('失敗 設定打開後',d,'ms 點擊會穿過去',w)}
    await p.waitForTimeout(1200);await p.click('#setBtn');
    for(let i=0;i<5;i++){await p.waitForTimeout(80);const u=await p.evaluate(()=>{const e=document.elementFromPoint(innerWidth/2+60,innerHeight/2);return e&&!!e.closest('#pager')});
      if(u){bad++;console.log('失敗 關閉過程點擊落到底下那頁',w)}}
    await p.waitForTimeout(1200)}
}
console.log(bad?'有失敗':'通過 設定開關過程點擊不會穿過去');await h.b.close();process.exit(bad?1:0)})();
