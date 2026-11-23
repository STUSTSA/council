/* 手機換分頁：兩頁並排滑動（render.js secSwap）。中途兩頁各在一邊、不重疊，結束後乾淨 */
const c=require('./common');(async()=>{const {mk}=await c.setup();let bad=0;const A=(x,m)=>{if(!x){bad++;console.log('FAIL',m)}else console.log('ok',m)};
const OUT=process.env.OUT||'/tmp';
const p=await mk(390,800,'light',true);await p.waitForTimeout(800);
const probe=()=>p.evaluate(()=>{const r=[...document.querySelectorAll('.layout>.sgroup')].filter(g=>g.offsetParent||g.classList.contains('sg-out')).map(g=>{const b=g.getBoundingClientRect();return {sec:g.dataset.sec,out:g.classList.contains('sg-out'),l:Math.round(b.left),r:Math.round(b.right)}});return {r,cls:document.querySelector('.layout').className,sx:document.documentElement.scrollWidth,px:document.querySelector('#pageMain').scrollWidth,cw:document.querySelector('#pageMain').clientWidth}});
await p.evaluate(()=>{document.querySelector('#tabbar [data-tab=progress]').click()});
let mid=null;for(let i=0;i<5;i++){await p.waitForTimeout(i?45:30);const s=await probe();console.log(JSON.stringify(s));await p.screenshot({path:`${OUT}/tabslide_${i}.png`});if(i==2)mid=s}
const o=mid.r.find(x=>x.out),n=mid.r.find(x=>!x.out);
A(o&&n&&o.r<=n.l+20&&o.l<0,'中途：舊頁在左、新頁在右，不重疊');
A(mid.px<=mid.cw,'沒有出現橫向捲動');
await p.waitForTimeout(600);const e=await probe();
A(e.r.length===1&&!e.r[0].out&&!/sg-slide/.test(e.cls),'結束：只剩新頁、類別拿掉');
/* 往回 */
await p.evaluate(()=>{document.querySelector('#tabbar [data-tab=live]').click()});await p.waitForTimeout(110);const m2=await probe();console.log(JSON.stringify(m2));
const o2=m2.r.find(x=>x.out),n2=m2.r.find(x=>!x.out);A(o2&&n2&&o2.l>=n2.r-20,'往前一頁：舊頁往右、新頁從左');
await p.waitForTimeout(600);
/* 連點不壞 */
await p.evaluate(()=>{for(const k of['progress','done','live'])document.querySelector(`#tabbar [data-tab=${k}]`).click()});await p.waitForTimeout(800);const f=await probe();A(f.r.length===1&&f.r[0].sec==='live'&&!/sg-slide/.test(f.cls),'連續切換後乾淨');
A(!p.errs.length,'沒有錯誤 '+p.errs.join('|'));
process.exit(bad?1:0)})();
