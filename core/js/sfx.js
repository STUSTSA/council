/* 核心｜音效（DESIGN-next 第十五節）：Web Audio 現場合成，不載音檔；短、軟、帶一點敲擊的質感。合成方式與每種音的參數照模擬頁（docs/預覽/新介面模擬.html 的 sfx）。
   十一種（名稱沿用模擬頁）：move 移動焦點、enter 進入、back 返回、tab 換頁、open 展開、check 勾選、ok 確認、no 否定、roll 滾動、tap 一般按鈕、fete 慶祝。
   - Sfx.play(名稱)：功能自己要出聲的地方（換焦點、進出、換頁、展開、換月、慶祝…；鍵盤、系統返回鍵、拖曳走到同一個函式也會響）。
   - 點擊的預設音（下面 CLICK）：在 window 的捕獲階段、各功能還沒改狀態之前看點到什麼；同一次點擊裡功能自己呼叫的 Sfx.play 蓋過它。
   - Sfx.result(成功?)：儲存的結果（save.js 的 persist、live.js 的 kpSave）：成功＝ok（這次操作已經響過就不再響，例如對話框按確定、完成的慶祝）；失敗＝no。
   一次操作只響一種：同一個工作（task）裡的呼叫先收著，工作結束才挑一個播（功能呼叫優先於點擊預設音，先到先播；慶祝最優先）；
   按下（pointerdown／keydown）之後已經響過，接著來的點擊預設音就不響（例如主頁卡片堆放開就換焦點，後面跟來的 click）；按下後移動超過 8px 才放開（拖曳）也不響。
   節流：同一種 40ms 內只響一次。音量：各音 .03–.22 照模擬頁，總音量 1（模擬頁 .5，2026-11-20 使用者反映太小而加倍）、後面接 DynamicsCompressor 防止疊音削波。
   開關是設定 → 外觀的「音效」（theme.js 的 UI.get().sound，存在這台裝置，預設開）；關閉時不建立 AudioContext、不出聲。
   AudioContext 只在使用者操作（按下、放開、點擊、按鍵）時建立或 resume，或在操作後 1 秒內要出聲時建立；不用 <audio> 播靜音檔之類的方式解除系統靜音。
   不出聲的情況：音效關閉；第一次按下或按鍵之前；分頁在背景（document.hidden）；瀏覽器沒有 Web Audio；iPhone 靜音開關開著（Web Audio 跟著系統靜音）。
   減少動態（prefers-reduced-motion）不影響音效。 */
const Sfx=(()=>{
  let ctx=null,out=null,nz=null,pend=null,gestAt=-1e9,fired=false,down=null;
  const last={},now=()=>performance.now();
  const on=()=>{try{return UI.get().sound!==false}catch(_){return true}};
  function init(){
    if(ctx)return true;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
    ctx=new AC();out=ctx.createGain();out.gain.value=1;   /* 總音量（原 .5，2026-11-20 加倍）；後面接壓縮器，疊音（慶祝）不會削波破音 */
    const cp=ctx.createDynamicsCompressor();cp.threshold.value=-14;cp.knee.value=12;cp.ratio.value=6;cp.attack.value=.003;cp.release.value=.15;out.connect(cp);cp.connect(ctx.destination);
    const b=ctx.createBuffer(1,Math.round(ctx.sampleRate*.05),ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);nz=b;return true;
  }
  /* 一個音：f0→f1（Hz）、長度、音量、波形、延遲（秒） */
  function tone(f0,f1,dur,vol,type="sine",at=0){const t=ctx.currentTime+at,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(out);o.start(t);o.stop(t+dur+.03)}
  /* 敲擊聲：一小段雜訊過帶通濾波 */
  function tick(vol,freq=2600,at=0){const t=ctx.currentTime+at,n=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();n.buffer=nz;f.type="bandpass";f.frequency.value=freq;f.Q.value=1.2;
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+.035);n.connect(f).connect(g).connect(out);n.start(t)}
  const K={
    move(){tick(.22,3000);tone(1320,1040,.05,.1,"triangle")},
    enter(){tone(523,784,.1,.14);tone(1047,1568,.14,.08,"sine",.06);tick(.14,2000)},
    back(){tone(784,494,.11,.13);tick(.1,1500)},
    tab(){tick(.14,2600);tone(660,880,.07,.11,"triangle")},
    open(){tick(.12,1800);tone(520,780,.09,.13)},
    check(){tick(.2,3200);tone(1200,1700,.05,.09)},
    ok(){tone(784,784,.08,.13);tone(1175,1175,.18,.11,"sine",.07)},
    no(){tone(300,170,.13,.15,"triangle");tick(.12,900)},
    roll(){tick(.12,3600);tone(1800,1500,.02,.03,"square")},
    tap(){tick(.16,2200);tone(880,700,.045,.08)},
    fete(){[523,659,784,1047,1319].forEach((f,i)=>{tone(f,f,.22,.13,"triangle",i*.11);tone(f*2,f*2,.16,.05,"sine",i*.11+.03)});
      [0,.04,.3,.42,.66,.8,1.02,1.2,1.45].forEach((t,i)=>tick(.1,3000+i*260,.55+t));[1047,1319,1568].forEach(f=>tone(f,f,.9,.07,"sine",.62));tone(2093,2093,.5,.04,"sine",1.1)},
  };
  /* 使用者操作的當下：建立或喚醒 AudioContext（音效關閉時不建立） */
  function wake(){if(!on())return;try{if(init()&&ctx.state!=="running")ctx.resume().catch(()=>{})}catch(_){}}   /* 不只 suspended：iOS 來電、鎖屏後是 interrupted，原本不喚醒就一直沒聲音 */
  function fire(k){
    if(!on()||document.hidden||!K[k])return;
    const t=now(),fresh=t-gestAt<1000;
    if(!ctx&&!(fresh&&init()))return;   /* 還沒有操作過：不建立（剛在設定裡打開音效的那一下例外：操作後 1 秒內） */
    if(ctx.state!=="running"){if(!fresh)return;ctx.resume().catch(()=>{})}   /* 被系統暫停（背景、來電）又不是剛操作：不排進去，免得恢復時一起響 */
    fired=true;if(t-(last[k]||-1e9)<40)return;last[k]=t;
    try{K[k]()}catch(_){}
  }
  function flush(){const p=pend;pend=null;if(p)fire(p.k)}
  /* 收著，這個工作結束才播；pri：1＝點擊預設音、2＝功能呼叫、3＝慶祝。比收著的高才換掉（同級先到先播） */
  function queue(k,pri){if(!K[k])return;if(!pend)setTimeout(flush,0);else if(pri<=pend.pri)return;pend={k,pri}}
  const play=k=>queue(k,k==="fete"?3:2);
  const result=ok=>{if(!ok)play("no");else if(!fired&&!pend)play("ok")};

  /* 點擊的預設音：由上往下第一個符合的。""＝不響（功能自己決定，或等儲存結果） */
  const CLICK=[
    [".hm-wc,.hm-tile,#dlg [data-act],[data-tldone],[data-edsave],[aria-disabled='true']",""],
    ["#setBtn[aria-expanded='true'],#notiBtn[aria-pressed='true'],.csel.open>.csel-btn,[data-calmon][aria-expanded='true'],[data-lcback],#pvBack,#subBack,#backMain,[data-tdclose],.hm-ly-x,.dh-home,[data-back]","back"],
    ["#tabbar .tab,#notiBtn,[role='tab'],[data-lctool],[data-lcstep],[data-kptm]","tab"],
    ["[data-cp],[data-jump],[data-set],[data-hub]","enter"],
    ["#setBtn,.csel-btn,[data-calmon],[data-lcpa],[aria-haspopup],.nd-card.today,summary","open"],   /* 今日卡片：按壓回彈後才打開今日層，音在按下的當下響 */
    ["[data-kpck],[role='checkbox'],[role='switch'],[role='radio'],input[type='checkbox'],input[type='radio'],.fld-check,.chip,[data-evrep],[data-teplc],[data-teiss]","check"],
    ["[data-evfx='ok'],[data-iffx='ok']","ok"],
    ["[data-evfx='cancel'],[data-iffx='cancel'],[data-edcancel],[data-evfx='del'],[data-iffx='del'],[data-stgdel],[data-kpdel],[data-kptdel],[data-kplkdel],.danger-btn,.danger-solid","no"],
    ["button,[role='button'],a[href],.csel-opt,[data-calday],[data-calset]","tap"],
  ];
  const clickKind=t=>{if(!t||!t.closest)return "";for(const [s,k] of CLICK)if(t.closest(s))return k;return ""};
  const begin=()=>{gestAt=now();wake()};
  /* 切回前景、從返回／快取還原頁面：瀏覽器可能已把 AudioContext 暫停；能喚醒就先喚醒（沒有操作時瀏覽器會拒絕，下一次按下再喚醒） */
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&ctx)wake()});addEventListener("pageshow",()=>{if(ctx)wake()});
  addEventListener("pointerdown",e=>{fired=false;down={x:e.clientX,y:e.clientY};begin()},true);
  addEventListener("keydown",e=>{if(!e.repeat)fired=false;down=null;begin()},true);
  addEventListener("pointerup",begin,true);addEventListener("touchend",begin,true);   /* 觸控：瀏覽器把放開當成「使用者操作」，在這裡才能喚醒 */
  addEventListener("click",e=>{begin();
    const drag=down&&e.detail>0&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8;
    const k=drag||fired?"":clickKind(e.target);if(k)queue(k,1)},true);
  return {play,result};
})();
