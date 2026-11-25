/* fl1：桌面即時回報左右分欄時，詳情卡往上延伸到搜尋列那一行（超出 #livePanel 的範圍），區塊高度過渡（motion.js 的 flowRO）不能把它裁掉。固定 8300 埠，github 模式。
   1536×695：動畫放慢後打開卡片、換一張、收起再打開，途中 #livePanel／#donePanel 都沒有被設成 overflow:clip，卡片標題那一排的中心點摸得到卡片（沒有被裁、沒有被蓋）；
   別的區塊（.panel）照舊有高度過渡（FLOW_SEL 仍含 .panel） */
const c=require('./common');
(async()=>{let bad=0;const ok=(x,m)=>{console.log((x?'OK  ':'FAIL')+' '+m);if(!x)bad++};
const {b,mk,login}=await c.setup();const p=await mk(1536,695,'dark',false);
await p.waitForTimeout(1500);await login(p);await p.waitForTimeout(900);
await p.evaluate(()=>{const e=state.events.find(x=>!x.doneAt);for(let i=0;i<8;i++)state.events.push({...JSON.parse(JSON.stringify(e)),id:'x'+i,name:'卡片'+i});render()});await p.waitForTimeout(900);
const cdp=await p.context().newCDPSession(p);await cdp.send('Animation.enable');await cdp.send('Animation.setPlaybackRate',{playbackRate:0.05});
const st=()=>p.evaluate(()=>{const h=document.querySelector('.lc-pane .lc .lc-head'),r=h&&h.getBoundingClientRect(),pn=document.querySelector('#livePanel');
  return {ov:getComputedStyle(pn).overflowY,flow:!!pn._flow,head:r?[Math.round(r.top),Math.round(pn.getBoundingClientRect().top)]:null}});
const chk=async t=>{const s=await st();ok(s.ov==='visible'&&!s.flow,`${t}：#livePanel 沒有被裁（overflow ${s.ov}、高度動畫 ${s.flow}）`);ok(s.head&&s.head[0]<s.head[1],`${t}：卡片標題在區塊上緣之上（延伸到搜尋列那一行）`+JSON.stringify(s.head));if(process.env.SHOTS)await p.screenshot({path:`${process.env.SHOTS}/fl1_${t}.png`})};
await p.click('#events .cp');await p.waitForTimeout(700);await chk('打開途中');
await p.waitForTimeout(1500);await p.click('.lc-nav [data-lcnav="1"],.lc-nav button:nth-child(2)').catch(()=>{});await p.waitForTimeout(600);await chk('換下一張途中');
ok(await p.evaluate(()=>FLOW_SEL.includes('.panel')&&document.querySelector('#progPanel').matches(FLOW_SEL)&&!document.querySelector('#livePanel').matches(FLOW_SEL)&&!document.querySelector('#donePanel').matches(FLOW_SEL)),'別的區塊仍有高度過渡，即時回報、完成紀錄兩塊不做');
ok(!p.errs.length,'沒有錯誤 '+p.errs.join('|'));
await b.close();process.exitCode=bad?1:0})();
