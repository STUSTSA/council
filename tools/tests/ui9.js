/* ui9：ui-09 的 K 項（ui-08 回報裡「沒做」「其他」的前端項目；docs/DESIGN-next.md）。github 模式，固定 8300 埠。
   K1 設定是部門內的一頁：1300、412 打開設定時部門標題列還在畫面上、是同一個節點、沒有被蓋住；設定（412 子頁也是）從標題列下緣開始蓋到底；
      底下的頁面不捲；關掉後標題列照舊
   （其他 K 項的斷言接在後面）
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common.js');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
/* 登入後共用密碼太短的對話框可能晚一點才跳出來（team.js 的 sharedPwFix）：測試先取消 */
const dlgOff=async p=>{for(let i=0;i<4;i++){await p.waitForTimeout(400);if(await p.evaluate(()=>$('#dlg').open))await p.click('#dlgForm [data-act=cancel]').catch(()=>{})}};
/* 每一輪各開一個瀏覽器（common.js 的測試資料在同一輪裡共用：第二次登入時身分「王」已經建好，流程不一樣） */
const fresh=async(w,sc='light')=>{const S=await c.setup(),touch=w<700,p=await S.mk(w,touch?900:860,sc,touch);await S.login(p);await dlgOff(p);p.__b=S.b;return p};
(async()=>{const errs=[];
  /* ---------- K1 設定是部門內的一頁 ---------- */
  for(const w of [1300,412]){const touch=w<700,p=await fresh(w);
    await p.evaluate(()=>{window.__dh=document.querySelector('.dhead');document.querySelector('#pageMain').scrollTop=400});
    await p.click('#setBtn');await p.waitForTimeout(900);
    const r=await p.evaluate(()=>{const h=document.querySelector('.dhead'),hr=h.getBoundingClientRect(),o=$('#setOv').getBoundingClientRect(),
      hit=document.elementFromPoint(hr.left+hr.width/2,hr.top+hr.height/2),home=document.elementFromPoint(...(r=>[r.left+r.width/2,r.top+r.height/2])($('.dh-home').getBoundingClientRect()));
      return {same:h===window.__dh,top:hr.top,hb:hr.bottom,ot:o.top,ob:o.bottom,ow:o.width,H:innerHeight,W:innerWidth,hit:!!hit&&!!hit.closest('.dhead'),home:!!home&&!!home.closest('.dh-home'),
        ovf:getComputedStyle($('#pageMain')).overflowY,st:$('#pageMain').scrollTop}});
    ok(r.same&&r.top>=0&&r.hit&&r.home,`${w} 設定開著：部門標題列還在畫面上（top ${r.top.toFixed(0)}）、同一個節點、沒有被蓋住（首頁鍵點得到）`);
    ok(Math.abs(r.ot-r.hb)<1.5&&Math.abs(r.ob-r.H)<1.5&&Math.abs(r.ow-r.W)<1.5,`${w} 設定從標題列下緣（${r.hb.toFixed(0)}）蓋到底（${r.ot.toFixed(0)}–${r.ob.toFixed(0)}）`);
    ok(r.ovf==='hidden'&&r.st===0,`${w} 打開時頁面捲回頂端、底下的頁面不捲（${r.ovf} ${r.st}）`);
    if(touch){await p.evaluate(()=>document.querySelector('#setOv [data-set="labels"]').click());await p.waitForTimeout(1100);
      const s=await p.evaluate(()=>{const s=$('#setSub').getBoundingClientRect(),h=document.querySelector('.dhead').getBoundingClientRect();return {open:subOpen,t:s.top,hb:h.bottom,b:s.bottom,H:innerHeight}});
      ok(s.open&&Math.abs(s.t-s.hb)<1.5&&Math.abs(s.b-s.H)<1.5,`412 子頁也從標題列下緣開始（${s.t.toFixed(0)}／${s.hb.toFixed(0)}）`);
      await p.evaluate(()=>$('#subBack').click());await p.waitForTimeout(900)}
    await p.click('#setBtn');await p.waitForTimeout(900);
    const e=await p.evaluate(()=>({open:setOpen,hid:$('#setOv').hidden,ovf:getComputedStyle($('#pageMain')).overflowY,same:document.querySelector('.dhead')===window.__dh}));
    ok(!e.open&&e.hid&&e.ovf==='auto'&&e.same,`${w} 再按設定鍵關掉：頁面可以捲、標題列同一個節點`);
    errs.push(...p.errs);await p.__b.close()}

  ok(!errs.length,`沒有 pageerror${errs.length?'：'+errs.slice(0,3).join('；'):''}`);
  console.log(`\n${passes} 通過，${fails} 失敗`);process.exit(fails?1:0)})();
