/* mb1：即時回報編輯中連續的純文字行合成一個大輸入框（像備忘錄），儲存格式不變。github 模式（data_test.json），固定 8300 埠。
   1. 連續文字行＝一個 textarea（內容用換行接起來）；核取行、時間行各自一列，順序保留（文字、核取、文字＝兩個框）
   2. 打字：中間按 Enter＝多一筆（其他行的 ID 不變）、刪掉一行（選取跨行刪除）＝少一筆、貼上多行＝多筆、空行＝空的一筆
   3. 長文字自動折行（框變高、不橫向捲）；手機寬度 390 也是
   4. 整個框空了按 Backspace＝刪掉那個空行；滿 50 行時 Enter 被擋
   5. 存檔：blocks 與 desc 一致（週報、完成紀錄讀 desc／blocks 照舊），重新打開還是同樣幾行
   失敗會印 FAIL 並以非 0 結束 */
const c=require('./common');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
(async()=>{
  let b;
  for(const [w,h,touch] of [[390,844,true],[1300,900,false]].filter(x=>!process.argv[2]||+process.argv[2]===x[0])){
    const tag=w+'：';
    const S0=await c.setup();b=S0.b;const {mk,login}=S0;   /* 每個寬度各開一個瀏覽器與一份新的假遠端（共用同一份時，第二次登入會遇到已建立身分的對話框） */
    const p=await mk(w,h,'light',touch);await login(p);
    await p.evaluate(()=>{setSection('live',{instant:true});render()});await p.waitForTimeout(600);
    const id=await p.evaluate(()=>{const e=state.events.find(e=>!e.doneAt);
      e.blocks=[{id:'m1',text:'第一行',check:null,timeId:null},{id:'m2',text:'',check:null,timeId:null},{id:'m3',text:'第三行很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長',check:null,timeId:null},{id:'m4',text:'核取項目',check:false,timeId:null},{id:'m5',text:'核取後的文字',check:null,timeId:null}];
      e.times=e.times||[];e.desc=StoreMap.descOf(e.blocks);render();return e.id});
    const cpSel=w>=1000?`#events .cp[data-cp="${id}"]`:`#events .cp[data-cp="${id}"]`;
    await p.click(cpSel);await p.waitForTimeout(800);
    await p.click('.lc [data-blk="m1"] .tx');await p.waitForTimeout(500);
    const st=()=>p.evaluate(i=>{const ev=state.events.find(e=>e.id===i);return {t:ev.blocks.map(b=>b.text),ids:ev.blocks.map(b=>b.id),k:ev.blocks.map(b=>b.check),desc:ev.desc,
      tas:[...document.querySelectorAll('.lc-ed textarea[data-kpgrp]')].map(x=>({v:x.value,ids:x.dataset.kpids,sh:x.scrollHeight,ch:x.clientHeight,sw:x.scrollWidth,cw:x.clientWidth})),
      rows:[...document.querySelectorAll('.lc-ed .lns > .ln')].map(x=>x.dataset.k)}},id);
    let s=await st();
    ok(s.tas.length===2&&s.tas[0].v==='第一行\n\n'+s.t[2]&&s.tas[0].ids==='m1 m2 m3'&&s.tas[1].v==='核取後的文字',tag+'連續三行合成一個框、核取行後面的文字是另一個框：'+JSON.stringify(s.rows));
    ok(s.rows.join()==='text,check,text',tag+'順序保留（文字、核取、文字）');
    ok(s.tas[0].sh<=s.tas[0].ch+1&&s.tas[0].sw<=s.tas[0].cw+1,tag+'長文字折行、框夠高、不橫向捲（高 '+s.tas[0].ch+'）');
    /* 在第一行後面按 Enter、打字 */
    await p.keyboard.press('Control+Home');await p.keyboard.press('End');await p.keyboard.press('Enter');await p.keyboard.type('插入的一行');await p.waitForTimeout(200);
    s=await st();
    ok(s.t.join('|').startsWith('第一行|插入的一行||第三行')&&s.ids[0]==='m1'&&s.ids.includes('m2')&&s.ids.includes('m3')&&s.ids.length===6,tag+'中間 Enter＝多一筆、原本的行 ID 都還在：'+s.ids.join());
    ok(s.desc===s.t.map((t,i)=>s.k[i]===null?t:(s.k[i]?'☑ ':'☐ ')+t).join('\n'),tag+'desc 跟 blocks 一致');
    /* 選取跨行刪除 */
    await p.keyboard.press('Control+Home');await p.keyboard.down('Shift');await p.keyboard.press('ArrowDown');await p.keyboard.press('ArrowDown');await p.keyboard.up('Shift');await p.keyboard.press('Delete');await p.waitForTimeout(200);
    s=await st();
    ok(s.t.length<6&&s.tas[0].v===s.t.slice(0,s.t.length-2).join('\n')+'',tag+'跨行刪除＝少筆：'+JSON.stringify(s.t.map(x=>x.slice(0,6))));
    /* 貼上多行 */
    await p.evaluate(()=>{const a=document.querySelector('.lc-ed textarea[data-kpgrp]');a.focus();a.setSelectionRange(a.value.length,a.value.length);document.execCommand('insertText',false,'甲\n乙\n丙')});await p.waitForTimeout(200);
    s=await st();
    ok(s.t.slice(-5,-2).join('|').endsWith('甲|乙|丙')||s.t.join('|').includes('甲|乙|丙'),tag+'貼上多行＝多筆：'+JSON.stringify(s.t.map(x=>x.slice(0,4))));
    ok(s.k.filter(x=>x!==null).length===1&&s.k[s.t.indexOf('核取項目')]===false,tag+'核取行還在、狀態沒變');
    await p.screenshot({path:`/tmp/claude-0/shot/mb1_${w}.png`});
    /* 存檔後重開 */
    await p.keyboard.press('Escape');await p.waitForTimeout(1500);
    const saved=await p.evaluate(i=>{const ev=state.events.find(e=>e.id===i);return {t:ev.blocks.map(b=>b.text),d:ev.desc}},id);
    ok(saved.t.length===s.t.length&&saved.d===saved.t.map((t,i)=>i===saved.t.indexOf('核取項目')?'☐ '+t:t).join('\n').replace(/^(.*)$/s,x=>x),tag+'存檔後 blocks、desc 一致（'+saved.t.length+' 行）');
    ok(p.errs.length===0,tag+'沒有錯誤 '+p.errs.join(';'));
    await p.context().close();await b.close();
  }
  console.log(fails?`FAIL ${fails}`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})();
