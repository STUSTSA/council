/* 核心｜音效（DESIGN-next 第十五節）：Web Audio 現場合成，不載音檔；短、軟、帶一點敲擊的質感。
   開關是設定 → 外觀的「音效」（theme.js 的 UI.get().sound，存在這台裝置）；關閉時不建立 AudioContext、不出聲。
   第一次要出聲時才建立 AudioContext（瀏覽器規定要在使用者操作之後）。目前用到：check（勾選）、no（拖到刪除角）、fete（完成的慶祝，一段上行的音）。 */
const Sfx=(()=>{
  let ctx=null,out=null,nz=null;
  const on=()=>{try{return UI.get().sound!==false}catch(_){return true}};
  function init(){
    if(ctx)return true;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
    ctx=new AC();out=ctx.createGain();out.gain.value=.5;out.connect(ctx.destination);
    const b=ctx.createBuffer(1,Math.round(ctx.sampleRate*.05),ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);nz=b;return true;
  }
  /* 一個音：f0→f1（Hz）、長度、音量、波形、延遲（秒） */
  function tone(f0,f1,dur,vol,type="sine",at=0){const t=ctx.currentTime+at,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(out);o.start(t);o.stop(t+dur+.03)}
  /* 敲擊聲：一小段雜訊過帶通濾波 */
  function tick(vol,freq=2600,at=0){const t=ctx.currentTime+at,n=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();n.buffer=nz;f.type="bandpass";f.frequency.value=freq;f.Q.value=1.2;
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+.035);n.connect(f).connect(g).connect(out);n.start(t)}
  const K={
    check(){tick(.2,3200);tone(1200,1700,.05,.09)},
    no(){tone(300,170,.13,.15,"triangle");tick(.12,900)},
    fete(){[523,659,784,1047,1319].forEach((f,i)=>{tone(f,f,.22,.13,"triangle",i*.11);tone(f*2,f*2,.16,.05,"sine",i*.11+.03)});
      [0,.04,.3,.42,.66,.8,1.02,1.2,1.45].forEach((t,i)=>tick(.1,3000+i*260,.55+t));[1047,1319,1568].forEach(f=>tone(f,f,.9,.07,"sine",.62));tone(2093,2093,.5,.04,"sine",1.1)},
  };
  function play(k){if(!on()||!K[k])return;try{if(!init())return;if(ctx.state==="suspended")ctx.resume();K[k]()}catch(_){}}
  return {play};
})();
