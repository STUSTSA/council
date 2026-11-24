/* 核心｜使用說明（設定 →「使用說明」；DESIGN.md「設定頁」的「使用說明」）
   一項教學一頁：上面是一塊縮小的示範畫面（.gd-stage），先自動播一次操作（一顆手指點給你看），按「開始練習」後同一塊畫面換成自己動手。
   - 示範與練習是同一份假畫面、同一份假資料（每一項的 init()）：示範＝程式照 demo 的步驟去點、打字、拖曳；練習＝使用者自己來。
   - 假資料只活在這一頁的變數裡：不讀也不寫 state、Firestore、localStorage，離開這一頁就沒了。
   - 畫面用 morphTo 原位更新；所有文字經 esc()。外框沿用帳號面板（account.js 的 acctPanel）：桌面在設定右側面板、手機在子頁，
     左上「上一頁」、系統返回一次退一層（教學 → 教學清單 → 設定）。
   - 減少動態時不自動播，直接進練習。
   新增一項教學：在 GUIDE 加一筆 {k, ic, t, steps, init, html, act, input?, drag?, tasks, demo}。 */
const gdDay=n=>{const d=new Date();d.setDate(d.getDate()+n);return d};
const gdMD=n=>{const d=gdDay(n);return `${d.getMonth()+1}/${d.getDate()}`};
const gdBar=(t,{back,bell,n}={})=>`<div class="gd-bar">${back?`<button type="button" class="gd-ib" data-gd="back" aria-label="上一頁">${ico("back","solo")}</button>`:""}<b>${esc(t)}</b>${bell?`<button type="button" class="gd-ib gd-bell" data-gd="bell" aria-label="通知">${ico("bell","solo")}${n?`<span class="gd-n num">${n}</span>`:""}</button>`:""}</div>`;
const gdCps=list=>`<div class="gd-cps">${list.map(([t,st])=>`<span class="gd-cp" data-st="${esc(st)}"><i class="gd-dot"></i><b>${esc(t)}</b></span>`).join("")}</div>`;
const GD_BOARD=[["社團博覽會場地","ok"],["校車時刻調整","stall"],["期中問卷","ok"]];
/* 通知頁的四張卡（手機通知頁的樣子）：hot＝這一項教學要點的那一張 */
const gdNoti=(hot,nToday,nCheck)=>`<div class="gd-view" data-key="noti">${gdBar("通知",{back:true})}<div class="gd-ncs">${
  [["today","TODAY","今日",nToday],["tmr","TOMORROW","明日",1],["check","CHECKLIST","清點",nCheck],["cal","CALENDAR","行事曆",6]]
    .map(([k,en,t,n])=>`<${k===hot?`button type="button" data-gd="${k}"`:"span"} class="gd-nc${k===hot?" hot":""}"><small>${en}</small><b>${t}</b><span class="num">${n}</span></${k===hot?"button":"span"}>`).join("")}</div></div>`;
const gdBoard=n=>`<div class="gd-view" data-key="board">${gdBar("即時回報",{bell:true,n})}${gdCps(GD_BOARD)}</div>`;

const GUIDE=[
  /* 1 即時回報卡片：新增、編輯、完成、刪除 */
  {k:"live",ic:"live",t:"即時回報卡片",
    steps:["新增：按右下角的 ＋，選文字、清單或時間，幫卡片取名。","編輯：點卡片的內容直接改，按上一頁或點外面就存好。","完成：長按卡片拖到右上角，卡片移到完成紀錄。","刪除：長按卡片拖到左上角，確認後永久刪除。"],
    init:()=>({cards:[{id:"a",name:"社團博覽會場地",note:"已送出場地申請",st:"ok"},{id:"b",name:"校車時刻調整",note:"等總務處回覆",st:"stall"},{id:"c",name:"期中問卷",note:"",st:"ok"}],open:"",fab:false,ask:"",seq:0,snap:"",msg:"",did:{}}),
    html(s){
      const c=s.cards.find(x=>x.id===s.open),q=s.cards.find(x=>x.id===s.ask);
      if(c)return `<div class="gd-view gd-card" data-key="card"><div class="gd-bar"><button type="button" class="gd-ib" data-gd="close" aria-label="上一頁">${ico("back","solo")}</button><input class="gd-name" data-gdin="name" value="${esc(c.name)}" maxlength="30" placeholder="名稱" aria-label="名稱" autocomplete="off"></div>
        <textarea class="gd-note" data-gdin="note" rows="5" maxlength="200" placeholder="寫下進度" aria-label="內容">${esc(c.note)}</textarea>${s.msg?`<p class="gd-msg" data-key="msg">${esc(s.msg)}</p>`:""}</div>`;
      return `<div class="gd-view" data-key="list">${gdBar("即時回報")}<i class="gd-zone gd-zdel" aria-hidden="true">刪除</i><i class="gd-zone gd-zok" aria-hidden="true">完成</i>
        <div class="gd-cps">${s.cards.map(x=>`<button type="button" class="gd-cp" data-gd="open" data-key="${esc(x.id)}" data-st="${esc(x.st)}"><i class="gd-dot"></i><b>${esc(x.name)}</b></button>`).join("")}</div>
        ${s.msg?`<p class="gd-msg" data-key="msg">${esc(s.msg)}</p>`:""}
        ${s.fab?`<div class="gd-fabopts" data-key="fo">${[["text","文字"],["box","清單"],["clock","時間"]].map(([ic,t])=>`<button type="button" class="gd-fo" data-gd="add" data-k="${ic}">${ico(ic,"solo")}<span>${t}</span></button>`).join("")}</div>`:""}
        <button type="button" class="gd-fab${s.fab?" on":""}" data-gd="fab" aria-label="新增即時回報">${ico("plus","solo")}</button>
        ${q?`<div class="gd-ask" data-key="ask" role="alertdialog" aria-label="刪除確認"><div><b>${q.name.trim()?`刪除「${esc(q.name.trim())}」？`:"刪除這張卡片？"}</b><p><button type="button" data-gd="ask-no">取消</button><button type="button" class="danger" data-gd="ask-yes">刪除</button></p></div></div>`:""}</div>`;
    },
    act(s,a,el){
      const id=el&&el.dataset.key,c=s.cards.find(x=>x.id===s.open);s.msg="";
      if(a==="fab")s.fab=!s.fab;
      else if(a==="add"){const n={id:"n"+(++s.seq),name:"",note:"",st:"ok",fresh:true};s.cards.unshift(n);s.open=n.id;s.fab=false;s.snap="";return "name"}
      else if(a==="open"){const x=s.cards.find(y=>y.id===id);if(!x)return;s.open=id;s.fab=false;s.snap=x.name+"\n"+x.note}
      else if(a==="close"&&c){
        if(!c.name.trim()){if(c.note.trim()){s.msg="請填名稱";return "name"}s.cards=s.cards.filter(x=>x!==c);s.open="";return}   /* 新增後什麼都沒填的卡片不留（跟真的看板一樣） */
        if(c.fresh){c.fresh=false;s.did.add=true;s.msg="已儲存"}else if(c.name+"\n"+c.note!==s.snap){s.did.edit=true;s.msg="已儲存"}
        s.open="";
      }
      else if(a==="drop-ok"){s.cards=s.cards.filter(x=>x.id!==id);s.did.ok=true;s.msg="已移到完成紀錄"}
      else if(a==="drop-del")s.ask=id;
      else if(a==="ask-no")s.ask="";
      else if(a==="ask-yes"){s.cards=s.cards.filter(x=>x.id!==s.ask);s.ask="";s.did.del=true;s.msg="已刪除"}
    },
    input(s,k,v){const c=s.cards.find(x=>x.id===s.open);if(c&&(k==="name"||k==="note"))c[k]=v},
    /* 長按（滑鼠拖 6px）後拖到角落：右上＝完成、左上＝刪除；沒拖到角落就彈回 */
    drag:{sel:".gd-cp[data-gd]",hold:true,
      tf:(dx,dy)=>`translate(${dx}px,${dy}px) scale(1.04)`,
      drop(dx,dy,el,box){const r=el.getBoundingClientRect(),b=box.getBoundingClientRect(),x=r.left+r.width/2-b.left,y=r.top+r.height/2-b.top;
        return y>96?"":x>b.width*.62?"drop-ok":x<b.width*.38?"drop-del":""},
      to(a,el,box){const r=el.getBoundingClientRect(),b=box.getBoundingClientRect(),cx=r.left+r.width/2-b.left,cy=r.top+r.height/2-b.top;return [(a==="drop-ok"?b.width*.8:b.width*.2)-cx,52-cy]},
      out:(a,dx,dy)=>a==="drop-ok"?`translate(${dx+40}px,${dy-30}px) scale(.2)`:""},
    tasks:[["按右下角的 ＋ 選一種，幫新卡片取名，再按左上的上一頁",s=>s.did.add],["點一張卡片改一下內容，再按上一頁",s=>s.did.edit],["長按一張卡片，拖到右上角的「完成」",s=>s.did.ok],["長按一張卡片，拖到左上角的「刪除」",s=>s.did.del]],
    demo:[{do:"tap",on:"[data-gd=fab]",say:"按右下角的 ＋ 新增"},{do:"tap",on:"[data-k=text]",say:"選要先放哪一種內容"},{do:"type",on:"[data-gdin=name]",text:"迎新茶會",say:"幫卡片取名"},{do:"tap",on:"[data-gd=close]",say:"按上一頁就存好"},
      {do:"tap",on:".gd-cp:nth-child(3)",say:"點卡片就能編輯"},{do:"type",on:"[data-gdin=note]",text:"，已排上議程",say:"直接改內容"},{do:"tap",on:"[data-gd=close]",say:"按上一頁就存好"},
      {do:"drag",on:".gd-cp:nth-child(2)",to:"drop-ok",say:"長按拖到右上角＝完成"},{do:"drag",on:".gd-cp:nth-child(2)",to:"drop-del",say:"長按拖到左上角＝刪除"},{do:"tap",on:"[data-gd=ask-yes]",say:"確認後才會刪除"}]},

  /* 3 通知裡看過期的事：清點區的卡片堆，右滑完成、左滑改期 */
  {k:"overdue",ic:"bell",t:"看過期的事",
    steps:["按右上角的鈴鐺，進通知頁。鈴鐺上的紅色數字就是過期幾件。","點「清點」，已過期的事會疊成一疊卡片。","最上面那張往右滑＝完成，往左滑＝改期。","電腦版：按鈴鐺後清點就在左邊，卡片下面也有「改期」「完成」兩顆按鈕。"],
    init:()=>({view:"board",pile:[{id:"p1",name:"送出場地申請表",from:"社團博覽會場地",d:gdMD(-4)},{id:"p2",name:"回覆總務處",from:"校車時刻調整",d:gdMD(-3)},{id:"p3",name:"問卷題目定稿",from:"期中問卷",d:gdMD(-1)}],msg:"",did:{}}),
    html(s){
      if(s.view==="board")return gdBoard(s.pile.length);
      if(s.view==="noti")return gdNoti("check",2,s.pile.length);
      return `<div class="gd-view" data-key="check">${gdBar("清點",{back:true})}<small class="gd-late">已過期</small>
        ${s.pile.length?`<div class="gd-pile">${s.pile.slice(0,3).map((x,i)=>`<div class="gd-pc${i?"":" top"}" data-key="${esc(x.id)}" style="--i:${i}"><small class="num">${esc(x.d)}</small><b>${esc(x.name)}</b><span>${esc(x.from)}</span></div>`).reverse().join("")}</div>
          <div class="gd-pbtns"><button type="button" class="icon" data-gd="p-later">改期</button><span class="num">剩 ${s.pile.length} 張</span><button type="button" class="icon" data-gd="p-ok">完成</button></div>`
          :`<p class="gd-none" data-key="none">過期的事都處理完了</p>`}
        ${s.msg?`<p class="gd-msg" data-key="msg">${esc(s.msg)}</p>`:""}</div>`;
    },
    act(s,a){
      const top=s.pile[0];s.msg="";
      if(a==="bell"){s.view="noti";s.did.bell=true}
      else if(a==="check"){s.view="check";s.did.check=true}
      else if(a==="back")s.view=s.view==="check"?"noti":"board";
      else if((a==="p-ok"||a==="p-later")&&top){s.pile.shift();if(a==="p-ok"){s.did.ok=true;s.msg=`已完成「${top.name}」`}else{s.did.later=true;s.msg="改期：真的看板會打開那張卡片的時間頁"}}
    },
    drag:{sel:".gd-pc.top",hold:false,
      tf:dx=>`translateX(${dx}px) rotate(${(dx/18).toFixed(2)}deg)`,
      drop:(dx,dy,el)=>Math.abs(dx)<el.offsetWidth*.3?"":dx>0?"p-ok":"p-later",
      to:(a,el)=>[(a==="p-ok"?1:-1)*el.offsetWidth*.45,0],
      out:(a,dx)=>`translateX(${dx>0?460:-460}px) rotate(${dx>0?22:-22}deg)`},
    tasks:[["按右上角的鈴鐺",s=>s.did.bell],["點「清點」那張卡片",s=>s.did.check],["把最上面那張往右滑（完成）",s=>s.did.ok],["再把一張往左滑（改期）",s=>s.did.later]],
    demo:[{do:"tap",on:"[data-gd=bell]",say:"按右上角的鈴鐺"},{do:"tap",on:"[data-gd=check]",say:"點「清點」"},{do:"drag",on:".gd-pc.top",to:"p-ok",say:"往右滑＝完成"},{do:"drag",on:".gd-pc.top",to:"p-later",say:"往左滑＝改期"}]},

  /* 4 今天要處理的事：通知頁的「今日」卡片 → 今日層 */
  {k:"today",ic:"calendar",t:"看今天要處理的事",
    steps:["按右上角的鈴鐺，進通知頁。","最上面「今日」卡片寫今天最該先看的一件事，右下角是今天總共幾件。","點「今日」卡片，放大成今天的完整清單，照時間排好。","看完按右上角的關閉；旁邊「明日」卡片是明天的。"],
    init:()=>({view:"board",did:{}}),
    items:()=>[["09:00","交週報給秘書處","每週回報"],["12:10","行政會議","學生會辦公室"],["到 "+gdMD(2),"問卷題目定稿","期中問卷"]],
    html(s){
      if(s.view==="board")return gdBoard(0);
      if(s.view==="noti")return gdNoti("today",3,0);
      const d=gdDay(0),it=this.items();
      return `<div class="gd-view gd-today" data-key="today"><button type="button" class="gd-ib" data-gd="shut" aria-label="關閉">${ico("close","solo")}</button>
        <span class="gd-big num">${d.getDate()}</span><b>今日</b><small>${d.getMonth()+1} 月・週${"日一二三四五六"[d.getDay()]}</small>
        <h4>本來就要做<span class="num">${it.length}</span></h4><ol>${it.map(([w,t,sub],i)=>`<li style="--i:${i}"><span class="num">${esc(w)}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></li>`).join("")}</ol></div>`;
    },
    act(s,a){
      if(a==="bell"){s.view="noti";s.did.bell=true}
      else if(a==="today"){s.view="today";s.did.open=true}
      else if(a==="shut"){s.view="noti";s.did.shut=true}
      else if(a==="back")s.view="board";
    },
    tasks:[["按右上角的鈴鐺",s=>s.did.bell],["點「今日」那張卡片",s=>s.did.open],["看完按右上角的關閉",s=>s.did.shut]],
    demo:[{do:"tap",on:"[data-gd=bell]",say:"按右上角的鈴鐺"},{do:"tap",on:"[data-gd=today]",say:"點「今日」卡片"},{do:"wait",ms:2200,say:"今天要做的事照時間排好"},{do:"tap",on:"[data-gd=shut]",say:"看完按關閉"}]},
];

function guideOpen(){
  return acctPanel("使用說明",p=>{
    const box=p.box;box.classList.add("gd-hub");let L=null,S=null,mode="demo",run=0,drag=null,dragged=false;
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const stage=()=>box.querySelector(".gd-stage"),inner=()=>box.querySelector(".gd-in");
    const left=()=>L.tasks.filter(([,ok])=>!ok(S));
    const tipHTML=say=>{
      if(mode==="demo")return `<b>示範</b>${esc(say||"")}`;
      const l=left(),n=L.tasks.length;
      return l.length?`<b class="num">練習 ${n-l.length+1}／${n}</b>${esc(l[0][0])}`:`<b>練習完成</b>這裡的內容不會存進看板`;
    };
    const tip=say=>{const t=box.querySelector(".gd-tip");if(t)morphTo(t,tipHTML(say))};
    const stageDraw=focus=>{const el=inner();if(!el)return;morphTo(el,L.html(S));tip();
      if(focus&&mode==="practice"){const f=el.querySelector(`[data-gdin="${focus}"]`);if(f)f.focus()}};
    function draw(){
      if(!L){p.html=`${p.head()}<div class="set-list">${GUIDE.map(l=>setRow(l.k,l.ic,l.t,false,"gdl")).join("")}</div>`;return}
      p.html=`<div class="gd-lesson">${panelHead(L.t)}
        <div class="gd-stage${mode==="demo"?" gd-auto":""}"><div class="gd-in">${L.html(S)}</div><i class="gd-finger" aria-hidden="true" hidden></i></div>
        <div class="gd-side"><p class="gd-tip" role="status">${tipHTML()}</p>
        <div class="gd-acts">${mode==="demo"?`<button type="button" class="primary" data-gdmode="practice">開始練習</button>`
          :`${reduceMotion()?"":`<button type="button" data-gdmode="demo">看示範</button>`}<button type="button" data-gdreset>重來</button>`}</div>
        <ol class="dev-steps">${L.steps.map(t=>`<li>${esc(t)}</li>`).join("")}</ol></div></div>`;
    }
    const doAct=(a,el)=>{const f=L.act(S,a,el);stageDraw(f)};
    function setMode(m){run++;drag=null;mode=m;S=L.init();draw();if(m==="demo")play()}
    function openLesson(k){L=GUIDE.find(l=>l.k===k);if(!L)return;p.sub(true,()=>{run++;L=null;S=null;p.sub(false);draw()});setMode(reduceMotion()?"practice":"demo")}

    /* ----- 示範：一顆手指照 demo 的步驟操作同一塊畫面（my!==run＝已經換模式、離開或重播，後面的步驟不做） ----- */
    let fx=0,fy=0;
    const finger=()=>box.querySelector(".gd-finger");
    async function fingerTo(el,ms=620){
      const f=finger(),st=stage();if(!f||!st||!el)return;
      const r=el.getBoundingClientRect(),b=st.getBoundingClientRect(),x=r.left+r.width/2-b.left,y=r.top+r.height/2-b.top;
      if(f.hidden){f.hidden=false;fx=b.width*.5;fy=b.height*.82}
      const a=f.animate([{transform:`translate(${fx}px,${fy}px)`},{transform:`translate(${x}px,${y}px)`}],{duration:ms,easing:MO.out,fill:"forwards"});
      fx=x;fy=y;await a.finished.catch(()=>{});
    }
    const press=()=>{const f=finger();return f?f.animate([{scale:1},{scale:.72},{scale:1}],{duration:320,easing:"ease-out"}).finished.catch(()=>{}):0};
    async function play(){
      const my=++run,live=()=>my===run&&p.alive&&L&&mode==="demo";
      while(live()){
        S=L.init();stageDraw();{const f=finger();if(f){f.getAnimations().forEach(a=>a.cancel());f.hidden=true}}
        await wait(700);
        for(const st of L.demo){
          if(!live())return;tip(st.say);
          if(st.do==="wait"){await wait(st.ms);continue}
          const el=inner().querySelector(st.on);if(!el)break;
          await fingerTo(el);if(!live())return;
          if(st.do==="tap"){await press();if(!live())return;doAct(el.dataset.gd,el);tip(st.say)}
          else if(st.do==="type"){await press();for(const ch of st.text){if(!live())return;el.value+=ch;L.input(S,el.dataset.gdin,el.value);await wait(95)}}
          else if(st.do==="drag"){
            const f=finger(),stg=stage(),[dx,dy]=L.drag.to(st.to,el,stg);
            await f.animate([{scale:1},{scale:.72}],{duration:L.drag.hold?420:160,fill:"forwards"}).finished.catch(()=>{});if(!live())return;
            stg.classList.add("gd-dragging");el.classList.add("gd-drag");
            const o={duration:760,easing:"cubic-bezier(.4,0,.2,1)",fill:"forwards"};
            const a1=el.animate([{transform:L.drag.tf(0,0)},{transform:L.drag.tf(dx,dy)}],o);
            f.animate([{transform:`translate(${fx}px,${fy}px)`,scale:.72},{transform:`translate(${fx+dx}px,${fy+dy}px)`,scale:.72}],o);fx+=dx;fy+=dy;
            await a1.finished.catch(()=>{});if(!live())return;
            await dragDone(el,st.to,dx,dy,a1);f.animate([{scale:.72},{scale:1}],{duration:200,fill:"forwards"});tip(st.say);
          }
          await wait(st.hold||900);
        }
        await wait(1500);
      }
    }

    /* ----- 拖曳（示範與練習共用收尾）：放開時算出動作 a；有飛出動畫的先飛出再改資料，還留在畫面上的彈回原位 ----- */
    async function dragDone(el,a,dx,dy,held){
      const stg=stage(),out=a&&L.drag.out(a,dx,dy),from=L.drag.tf(dx,dy);
      if(out&&!reduceMotion()){const fly=el.animate([{transform:from},{transform:out,opacity:0}],{duration:220,easing:"ease-in",fill:"forwards"});if(held)held.cancel();el.style.transform="";await fly.finished.catch(()=>{})}
      if(stg)stg.classList.remove("gd-dragging");
      if(a&&L)doAct(a,el);
      if(el.isConnected){el.getAnimations().forEach(x=>x.cancel());el.style.transform="";el.classList.remove("gd-drag");
        if(!reduceMotion())el.animate([{transform:from},{transform:"none"}],{duration:MO.slow,easing:MO.spring})}
    }
    box.addEventListener("pointerdown",e=>{
      if(!L||!L.drag||mode!=="practice"||drag||(e.pointerType==="mouse"&&e.button))return;
      const el=e.target.closest(L.drag.sel);if(!el||!inner().contains(el))return;
      const d=drag={el,id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,on:false,t:0};
      if(L.drag.hold)d.t=setTimeout(()=>{if(drag===d&&!d.on)dragOn(d)},380);
    });
    function dragOn(d){d.on=true;dragged=true;try{d.el.setPointerCapture(d.id)}catch(_){}d.el.classList.add("gd-drag");stage().classList.add("gd-dragging");d.el.style.transform=L.drag.tf(d.dx,d.dy)}
    box.addEventListener("pointermove",e=>{
      const d=drag;if(!d||e.pointerId!==d.id)return;
      d.dx=e.clientX-d.x;d.dy=e.clientY-d.y;
      if(!d.on){
        const far=Math.hypot(d.dx,d.dy)>6;
        if(L.drag.hold){if(far&&e.pointerType==="mouse")dragOn(d);else if(far){clearTimeout(d.t);drag=null}}   /* 觸控要先長按；還沒按夠久就移動＝不是拖曳 */
        else if(Math.abs(d.dx)>6)dragOn(d);
        return;
      }
      d.el.style.transform=L.drag.tf(d.dx,d.dy);
    });
    const dragEnd=e=>{
      const d=drag;if(!d||e.pointerId!==d.id)return;clearTimeout(d.t);drag=null;
      if(!d.on)return;
      setTimeout(()=>{dragged=false},0);   /* 放開後緊接著的 click 不算點一下 */
      dragDone(d.el,e.type==="pointerup"?L.drag.drop(d.dx,d.dy,d.el,stage()):"",d.dx,d.dy);
    };
    box.addEventListener("pointerup",dragEnd);box.addEventListener("pointercancel",dragEnd);

    box.addEventListener("click",e=>{
      const t=e.target;if(!t.closest)return;
      const row=t.closest("[data-gdl]");if(row){openLesson(row.dataset.gdl);return}
      if(!L)return;
      const m=t.closest("[data-gdmode]");if(m){setMode(m.dataset.gdmode);return}
      if(t.closest("[data-gdreset]")){setMode("practice");return}
      const b=t.closest("[data-gd]");
      if(!b||mode!=="practice"||dragged||!inner().contains(b))return;
      doAct(b.dataset.gd,b);
    });
    box.addEventListener("input",e=>{const f=e.target.closest&&e.target.closest("[data-gdin]");if(f&&L&&L.input&&mode==="practice"){L.input(S,f.dataset.gdin,f.value);tip()}});
    box.addEventListener("keydown",e=>{   /* 練習的名稱欄按 Enter＝存好返回（真的看板是換到內容；這裡只有一欄名稱）；Esc 不往外傳，免得把整個設定面板關掉 */
      if(!L||mode!=="practice"||!e.target.matches("[data-gdin]"))return;
      if(e.key==="Escape"){e.stopPropagation();e.target.blur()}
      else if(e.key==="Enter"&&e.target.dataset.gdin==="name"&&!e.isComposing){e.preventDefault();doAct("close")}
    });
    p.onEnd(()=>{run++;drag=null});
    draw();
  });
}
