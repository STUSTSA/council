/* 手機換分頁：只動要顯示的那一頁（render.js secSwap，2026-11-24；取代兩頁並排滑動的 tabslide1）。
   中途畫面上只有新頁（沒有退場層、舊頁不動也不留），新頁看得到的幾塊在播進場；結束後乾淨。
   另外看底部鏡片：動畫播的時候不每一格重量版面（nav.js 的 tbGeo），位置照樣到位 */
const c=require('./common');(async()=>{const {mk}=await c.setup();let bad=0;const A=(x,m)=>{if(!x){bad++;console.log('FAIL',m)}else console.log('ok',m)};
const OUT=process.env.OUT||'/tmp';
const p=await mk(390,800,'light',true);await p.waitForTimeout(800);
const probe=()=>p.evaluate(()=>{const gs=[...document.querySelectorAll('.layout>.sgroup')],vis=gs.filter(g=>g.offsetParent);
  return {vis:vis.map(g=>g.dataset.sec),out:gs.filter(g=>g.classList.contains('sg-out')).length,grp:gs.reduce((n,g)=>n+g.getAnimations().length,0),
    blk:vis.reduce((n,g)=>n+[...g.children].filter(e=>e.getAnimations().some(a=>a.id==='sec-in')).length,0),
    px:(document.querySelector('#pageMain')||document.documentElement).scrollWidth,cw:(document.querySelector('#pageMain')||document.documentElement).clientWidth}});
const lensAt=()=>p.evaluate(()=>{const l=document.querySelector('#tabbar .tb-lens').getBoundingClientRect(),t=document.querySelector('#tabbar .tab.on .tab-ind').getBoundingClientRect();return Math.round(Math.abs((l.left+l.right)/2-(t.left+t.right)/2))});
await p.evaluate(()=>{document.querySelector('#tabbar [data-tab=progress]').click()});
let mid=null;for(let i=0;i<4;i++){await p.waitForTimeout(i?45:30);const s=await probe();console.log(JSON.stringify(s));await p.screenshot({path:`${OUT}/tabin_${i}.png`});if(i==1)mid=s}
A(mid.vis.length===1&&mid.vis[0]==='progress'&&!mid.out,'中途：畫面上只有新頁，沒有退場層');
A(mid.grp===0&&mid.blk>0&&mid.blk<=8,'中途：整頁不動，只有新頁看得到的幾塊在進場（'+mid.blk+' 塊）');
A(mid.px<=mid.cw,'沒有出現橫向捲動');
await p.waitForTimeout(700);const e=await probe();
A(e.vis.length===1&&!e.out&&!e.blk,'結束：只剩新頁、動畫收乾淨');
A((await lensAt())<=1,'鏡片停在新分頁正中');
/* 往回 */
await p.evaluate(()=>{document.querySelector('#tabbar [data-tab=live]').click()});await p.waitForTimeout(110);const m2=await probe();console.log(JSON.stringify(m2));
A(m2.vis.length===1&&m2.vis[0]==='live'&&!m2.out&&m2.blk>0,'往前一頁：同樣只動新頁');
await p.waitForTimeout(700);A((await lensAt())<=1,'鏡片回到原分頁正中');
/* 連點不壞 */
await p.evaluate(()=>{for(const k of['progress','done','live'])document.querySelector(`#tabbar [data-tab=${k}]`).click()});await p.waitForTimeout(900);const f=await probe();
A(f.vis.length===1&&f.vis[0]==='live'&&!f.out&&!f.blk,'連續切換後乾淨');A((await lensAt())<=1,'連續切換後鏡片到位');
/* 視窗大小變了（轉向）：鏡片照新版面重新定位 */
await p.setViewportSize({width:800,height:390});await p.waitForTimeout(500);A((await lensAt())<=1,'轉成橫向後鏡片到位');
await p.evaluate(()=>{document.querySelector('#tabbar [data-tab=done]').click()});await p.waitForTimeout(900);A((await lensAt())<=1,'橫向換分頁後鏡片到位');
A(!p.errs.length,'沒有錯誤 '+p.errs.join('|'));
process.exit(bad?1:0)})();
