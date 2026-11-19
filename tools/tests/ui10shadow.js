/* ui10shadow：柔光主題（neu）的陰影不被設定頁裁掉（ui-10 C，DievE 11/19 標「錯」）。github 模式，固定 8300 埠（run-tests.sh 換埠時會一起換）。
   現象：柔光主題下設定頁每一列色塊的雙向柔影在左右兩側被直直切掉（設定區左右邊界一條直線），標題列圓鈕下半部的陰影被設定頁切掉。
   原因：設定清單 .set-scroll、右側面板 .set-pane、手機子頁 .set-sub-body 都是 overflow:auto，色塊貼著容器左右邊（面板只留 4px、子頁 2px），
   陰影（7px 位移＋16px 模糊＝外擴 23px）被捲動容器的邊切掉；設定層 .set-ov（z-index 38、底色 --bg）從標題列下緣開始蓋，標題列在它底下，圓鈕往下的陰影被底色蓋掉。
   修法：theme.css 的 --sh-pad（陰影外擴距離，只有柔光有值）＋ board.css「設定頁」段三個捲動容器左右多留內距、再用負邊距抵掉；設定開著時標題列疊在設定層上面。
   柔光淺色、深色 × 412、1300：
   1. 設定清單、各面板（報告、人員、標籤、這台裝置、外觀；桌面右側面板、手機子頁）裡每個帶 --blk-sh 的色塊：
      陰影外擴矩形（box-shadow 的位移＋模糊＋擴散，先切到螢幕範圍）沒有超出任何會裁切的祖先（overflow 非 visible、clip-path、contain:paint）的範圍。
      裁切範圍＝祖先的框扣掉邊框（含捲軸槽：Chromium 實際畫到那裡；捲軸出現時捲軸本身蓋在那一條上）。被捲到容器外面的色塊不算
   2. 截圖：色塊左邊外 6px（亮的那一側陰影）跟底色不同；1300 面板打開時清單色塊右邊外 11px（暗的那一側）比底色暗——修改前這兩點被切掉、等於底色
   3. 標題列圓鈕：圓鈕正下方 6px、往右 7px（暗的那一側陰影）比底色暗（修改前被設定層的底色蓋掉、等於底色）；
      疊層：把設定層（手機子頁開著時也量子頁）暫時拉到最上緣，圓鈕中心點到的仍是圓鈕（設定層畫在圓鈕底下）
   4. 其他主題不變：米黃淺色（fin）與黑白黃深色（ink）× 412、1300，設定清單與標籤面板裡每個色塊的位置、尺寸，跟套回修改前的容器規則
      （904b089 的 margin、padding、flex-basis）時完全相同；柔光套回時會不同（證明套回的規則有作用）
   5. 沒有預期外的外部請求（只允許本機、fonts.googleapis.com、api.github.com，都已模擬）、沒有頁面錯誤
   SHOTS=<資料夾> 時存截圖（設定清單、標籤面板），不 commit。失敗會印 FAIL 並以非 0 結束 */
const common=require('./common.js');
let fails=0,passes=0;const ok=(v,m)=>{console.log((v?'OK ':'FAIL ')+m);if(v)passes++;else fails++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const SHOTS=process.env.SHOTS||'';

/* 在頁面裡跑：scope 裡每個帶 --blk-sh 的色塊，陰影外擴矩形有沒有被會裁切的祖先切到 */
function audit(scope){
  const probe=document.createElement('div');probe.style.boxShadow='var(--blk-sh)';document.body.append(probe);
  const SH=getComputedStyle(probe).boxShadow;probe.remove();
  if(!SH||SH==='none')return {sh:SH,n:0,bad:['沒有 --blk-sh']};
  const parse=s=>{const out=[];let d=0,cur='';for(const ch of s){if(ch==='(')d++;if(ch===')')d--;if(ch===','&&!d){out.push(cur);cur=''}else cur+=ch}out.push(cur);
    return out.map(x=>{const t=x.replace(/rgba?\([^)]*\)|inset/g,'').trim().split(/\s+/).map(parseFloat);return {inset:/inset/.test(x),x:t[0]||0,y:t[1]||0,b:t[2]||0,s:t[3]||0}})};
  const sh=parse(SH),VW=innerWidth,VH=innerHeight;
  const ext=r=>{let L=r.left,T=r.top,R=r.right,B=r.bottom;for(const s of sh){if(s.inset)continue;L=Math.min(L,r.left+s.x-s.b-s.s);T=Math.min(T,r.top+s.y-s.b-s.s);R=Math.max(R,r.right+s.x+s.b+s.s);B=Math.max(B,r.bottom+s.y+s.b+s.s)}
    return {L:Math.max(0,L),T:Math.max(0,T),R:Math.min(VW,R),B:Math.min(VH,B)}};
  const name=e=>e.id?'#'+e.id:e.tagName.toLowerCase()+(e.classList.length?'.'+[...e.classList].join('.'):'')+(e.dataset.set?`[${e.dataset.set}]`:e.dataset.hub?`[${e.dataset.hub}]`:'');
  const clipOf=a=>{const cs=getComputedStyle(a),ov=cs.overflowX!=='visible'||cs.overflowY!=='visible',cp=cs.clipPath&&cs.clipPath!=='none',ct=/paint|strict|content/.test(cs.contain);
    if(!ov&&!cp&&!ct)return null;const r=a.getBoundingClientRect();
    if(ov){const m=cs.overflowX==='clip'||cs.overflowY==='clip'?parseFloat(cs.overflowClipMargin)||0:0;
      return {L:r.left+(parseFloat(cs.borderLeftWidth)||0)-m,T:r.top+(parseFloat(cs.borderTopWidth)||0)-m,R:r.right-(parseFloat(cs.borderRightWidth)||0)+m,B:r.bottom-(parseFloat(cs.borderBottomWidth)||0)+m,why:'overflow '+cs.overflowX+'/'+cs.overflowY}}
    return {L:r.left,T:r.top,R:r.right,B:r.bottom,why:cp?'clip-path':'contain '+cs.contain}};
  const els=[...document.querySelectorAll(scope)].flatMap(s=>[s,...s.querySelectorAll('*')]).filter((e,i,a)=>a.indexOf(e)===i);
  const bad=[],names=[];
  for(const e of els){const cs=getComputedStyle(e);if(cs.boxShadow!==SH||cs.visibility==='hidden'||!e.getClientRects().length||e.closest('[hidden]'))continue;
    const r=e.getBoundingClientRect();if(r.width<2||r.height<2||r.bottom<=0||r.top>=VH||r.right<=0||r.left>=VW)continue;
    const s=ext(r);let a=e.parentElement,fixed=cs.position==='fixed',skip=false;const cuts=[];
    while(a&&a!==document.documentElement&&!fixed){const c=clipOf(a);
      if(c){if(r.left<c.L-.5||r.top<c.T-.5||r.right>c.R+.5||r.bottom>c.B+.5){skip=true;break}   /* 被捲到容器外面 */
        const over=Object.entries({左:c.L-s.L,上:c.T-s.T,右:s.R-c.R,下:s.B-c.B}).filter(([,v])=>v>.5).map(([k,v])=>k+v.toFixed(0));
        if(over.length)cuts.push(name(a)+'（'+c.why+'）'+over.join(' '))}
      if(getComputedStyle(a).position==='fixed')fixed=true;a=a.parentElement}
    if(skip)continue;names.push(name(e));if(cuts.length)bad.push(name(e)+' 被 '+cuts.join('；'))}
  return {sh:SH,n:names.length,names,bad};
}
/* 取畫面上一點的顏色（截 1×1，在頁面裡解碼） */
const px=async(p,x,y)=>{x=Math.round(x);y=Math.round(y);const s=(await p.screenshot({clip:{x,y,width:1,height:1}})).toString('base64');
  return p.evaluate(async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=c.height=1;const g=c.getContext('2d');g.drawImage(im,0,0);return [...g.getImageData(0,0,1,1).data].slice(0,3)},s)};
const bgOf=p=>p.evaluate(()=>getComputedStyle(document.getElementById('setOv')).backgroundColor.match(/\d+/g).slice(0,3).map(Number));
const lum=c=>(c[0]+c[1]+c[2])/3;
/* 修改前（904b089）的容器規則：用來證明其他主題的版面沒變 */
const OLD_CSS=`html body .set-ov .set-scroll{margin:0;padding:0}
html body .set-ov .set-body.split .set-scroll{flex:0 0 min(440px,40%)}
html body .set-ov .set-pane{margin:0;padding-left:4px;padding-right:4px}
html body .set-ov .set-sub-body{margin:0;padding-left:2px;padding-right:2px}
html body .set-ov .set-inner{padding-top:14px}`;
const rects=p=>p.evaluate(()=>[...document.querySelectorAll('#setOv .set-row,#setSub .set-row,#setOv .lbl-box,#setSub .lbl-box,#setOv .tm-row,#setSub .tm-row,#setOv .set-hub,#setSub .set-hub')]
  .filter(e=>e.getClientRects().length&&!e.closest('[hidden]')).map(e=>{const r=e.getBoundingClientRect();return [e.className.split(' ')[0]+(e.dataset.set||e.dataset.hub||''),+r.left.toFixed(2),+r.top.toFixed(2),+r.width.toFixed(2),+r.height.toFixed(2)].join(',')}));
const withOld=async(p,fn)=>{await p.evaluate(css=>{const s=document.createElement('style');s.id='oldCss';s.textContent=css;document.head.append(s);void document.body.offsetHeight},OLD_CSS);
  const r=await fn();await p.evaluate(()=>{document.getElementById('oldCss').remove();void document.body.offsetHeight});return r};

(async()=>{
  const extra=[];
  for(const [w,h,touch] of [[412,900,true],[1300,860,false]]){
    const {b,mk,login}=await common.setup();
    const ui={pal:'neu',mode:'light',sound:false};
    /* 每個新分頁：一開始就記外部請求、套主題 */
    const nc=b.newContext.bind(b);b.newContext=async o=>{const c=await nc(o);
      c.on('request',q=>{const u=q.url();if(/^(data|blob):/.test(u))return;const host=new URL(u).hostname;if(!/^(127\.0\.0\.1|localhost|fonts\.googleapis\.com|api\.github\.com)$/.test(host))extra.push(u)});
      await c.addInitScript(v=>{try{localStorage.setItem('stustsa-ui',v)}catch(_){}},JSON.stringify(ui));return c};
    const p=await mk(w,h,'light',touch);await p.emulateMedia({reducedMotion:'reduce'});
    await login(p);await W(400);
    const setTheme=async(pal,mode)=>{await p.evaluate(([pal,mode])=>{localStorage.setItem('stustsa-ui',JSON.stringify({pal,mode,sound:false}));document.documentElement.dataset.pal=pal;document.documentElement.dataset.theme=mode},[pal,mode]);await W(100)};
    const openSet=async()=>{if(!await p.evaluate(()=>setOpen)){await p.click('#setBtn');await W(700)}await p.mouse.move(1,h-1)};
    const closeSet=async()=>{if(await p.evaluate(()=>setOpen)){await p.click('#setBtn');await W(700)}};
    const openItem=async k=>{await p.click(`#setOv [data-set="${k}"]`);await W(1000);await p.mouse.move(1,h-1)};
    const closeItem=async k=>{if(touch){for(let i=0;i<3&&await p.evaluate(()=>subOpen);i++){await p.click('#subBack');await W(800)}}else if(await p.evaluate(()=>!!paneKey)){await p.click(`#setOv [data-set="${k}"]`);await W(800)}};
    /* 標題列圓鈕：截圖（正下方的暗面陰影）＋疊層（設定層暫時拉到最上緣，圓鈕中心點到的還是圓鈕） */
    const headCheck=async T=>{const bg=await bgOf(p);
      const bt=await p.evaluate(()=>[...document.querySelectorAll('.dhead .dh-btn')].filter(x=>x.getClientRects().length).map(x=>{const r=x.getBoundingClientRect();return {id:x.id||x.className.split(' ')[1]||'home',x:r.left+r.width/2,y:r.top+r.height/2,bot:r.bottom}}));
      const vals=[];for(const q of bt){const c=await px(p,q.x+7,q.bot+6);vals.push({id:q.id,d:lum(bg)-lum(c)})}
      ok(bt.length>=3&&vals.every(v=>v.d>=3),`${T} 標題列圓鈕正下方的陰影畫出來（比底色暗 3 階以上）：${vals.map(v=>v.id+' '+v.d.toFixed(1)).join('、')}`);
      const stack=await p.evaluate(bt=>{const out=[];for(const id of ['setOv','setSub']){const o=document.getElementById(id);if(!o||o.hidden)continue;const t=o.style.top;o.style.top='0px';
          for(const q of bt){const e=document.elementFromPoint(q.x,q.y);out.push(id+':'+q.id+'='+(e&&e.closest('.dhead')?'圓鈕':e&&o.contains(e)?'設定層':e?e.tagName:'無'))}o.style.top=t}return out},bt);
      ok(stack.length&&stack.every(s=>s.endsWith('圓鈕')),`${T} 疊層：設定層在標題列底下 ${stack.join(' ')}`)};
    const shadowCheck=async(T,lab)=>{const r=await p.evaluate(audit,'#setOv:not([hidden]),#setSub:not([hidden])');
      ok(r.n>0&&!r.bad.length,`${T} ${lab}：${r.n} 個色塊的陰影都沒被容器切到 ${r.bad.slice(0,6).join(' | ')}`)};
    /* 色塊兩側：左邊外 6px（亮面）跟底色不同；面板打開時清單色塊右邊外 11px（暗面）比底色暗 */
    const sideCheck=async(T,lab,right)=>{const bg=await bgOf(p);
      const rw=await p.evaluate(()=>{const e=[...document.querySelectorAll('#setOv .set-inner .set-row')].filter(x=>x.getClientRects().length)[1];const r=e.getBoundingClientRect();return {l:r.left,r:r.right,y:r.top+r.height/2}});
      const L=await px(p,rw.l-6,rw.y),dl=Math.abs(lum(L)-lum(bg));
      ok(dl>=1,`${T} ${lab} 清單色塊左邊外 6px 有亮面陰影（跟底色差 ${dl.toFixed(1)} 階，要 1 以上；修改前被切掉＝0）`);
      if(right){const R=await px(p,rw.r+11,rw.y+7),dr=lum(bg)-lum(R);ok(dr>=2,`${T} ${lab} 清單色塊右邊外 11px 有暗面陰影（比底色暗 ${dr.toFixed(1)} 階，要 2 以上）`)}};
    const shot=async n=>{if(SHOTS)await p.screenshot({path:`${SHOTS}/C-${n}.png`})};

    for(const mode of ['light','dark']){
      const T=`[${w} 柔光${mode==='light'?'淺色':'深色'}]`;ui.mode=mode;await setTheme('neu',mode);
      await openSet();
      await shadowCheck(T,'設定清單');await headCheck(T+' 設定清單');if(touch)await sideCheck(T,'設定清單',false);
      await shot(`${w}-${mode}-list`);
      for(const k of ['report','team','labels','device','look']){
        await openItem(k);await shadowCheck(T,`${k}（${touch?'子頁':'右側面板'}）`);
        if(k==='labels'){await headCheck(T+' 標籤'+(touch?'子頁':'面板'));if(!touch)await sideCheck(T,'標籤面板打開時',true);await shot(`${w}-${mode}-labels`)}
        await closeItem(k)}
      await closeSet();
    }
    /* 其他主題：版面跟修改前的容器規則一樣；柔光不一樣（套回的規則有作用） */
    for(const [pal,mode,same] of [['fin','light',true],['ink','dark',true],['neu','light',false]]){
      const T=`[${w} ${pal} ${mode}]`;await setTheme(pal,mode);await openSet();
      const a1=await rects(p),b1=await withOld(p,()=>rects(p));
      await openItem('labels');const a2=await rects(p),b2=await withOld(p,()=>rects(p));await closeItem('labels');await closeSet();
      const eq=JSON.stringify(a1)===JSON.stringify(b1)&&JSON.stringify(a2)===JSON.stringify(b2);
      if(same)ok(eq&&a1.length>=8&&a2.length>=6,`${T} 設定清單（${a1.length} 塊）與標籤${touch?'子頁':'面板'}（${a2.length} 塊）的位置、尺寸跟修改前的容器規則相同`+(eq?'':' 例：'+a1.filter((x,i)=>x!==b1[i]).concat(a2.filter((x,i)=>x!==b2[i])).slice(0,3).join(' / ')));
      else ok(!eq,`${T} 套回修改前的容器規則時版面會變（比對有作用）`);
    }
    ok(!p.errs.length,`[${w}] 沒有頁面錯誤 ${p.errs.join(' | ')}`);
    await b.close();
  }
  ok(!extra.length,'沒有預期外的外部請求 '+extra.slice(0,5).join(' '));
  console.log(fails?`失敗 ${fails} 項（通過 ${passes}）`:`全部通過（${passes} 項）`);process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
