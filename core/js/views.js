/* 核心｜各區塊畫面：頁首、週報、甘特圖、議題卡片、即時回報、完成紀錄 */
function renderHeader(){
  document.title=CFG.dept.name;renderHero();
  $("#saveInfo").textContent=readOnly()?`更新於 ${fmt(state.savedAt)||"—"}`
    :fsMode()?"":(state.savedAt?`上次儲存 ${state.savedAt}${state.savedBy?`（${state.savedBy}）`:""}`:"尚未儲存")+(cloudOn()?` · ${({ok:"雲端已同步",empty:"雲端尚無資料，儲存後建立",offline:"離線中",limited:"GitHub 讀取次數暫時用完",error:"雲端讀取失敗"})[cloud.status]||"連線雲端中…"}${cloudOn()&&!ghToken()&&loggedIn()?" · 這台裝置沒有連上雲端，儲存只會留在這台裝置":""}`:"")+(localOK?"":" · 這個瀏覽器無法本機保存，請用「匯出備份」");
  offlinePill();notiBadge();if(notiOpen)renderNoti();
  /* 2026-11-06：頁首的「編輯／取消／儲存」拿掉，改成每張卡片自己的「編輯」與「取消｜儲存」（render.js 的單卡編輯） */
}

/* 標題列（shell.js 的 .dhead）：只改有變的地方，節點一直留著。
   唯讀標籤＝沒有編輯權限的單位或唯讀檢視中；眼睛鈕＝可編輯的單位才有（render.js 的 deptCan、roView）；通知鈕＝沒有權限、唯讀檢視時不出現（DESIGN-next 第十四節） */
/* 標題列左上角：部門主頁是「首頁」（去各部門總覽），比部門主頁更深的頁面（Back 疊著任何一層：設定與它底下的各子頁、通知與行事曆、卡片詳情、工作報告、編輯紀錄；或進度的議題詳情）
   自動換成「上一頁」，按了關掉最上面一層；一路退回部門主頁才變回首頁。切換底部分頁不算更深（切換時設定、通知會先收起來）。圖示與無障礙名稱一起換。 */
function homeUp(){
  if(typeof setOpen!=="undefined"&&setOpen&&Back.top()==="settings"){if(paneKey)paneClose();else closeSettings();return}   /* 桌面設定的右側面板：先收面板，再關設定（跟 Esc 一樣） */
  if(Back.up())return;
  if(progOpen&&curSec==="progress")progShow(null);
}
const homeDeep=()=>Back.depth()>0||(!!progOpen&&curSec==="progress");
function homeSync(){
  const home=$(".dhead .dh-home");if(!home)return;
  const deep=homeDeep();if(home.classList.contains("up")===deep&&home.firstElementChild)return;
  home.classList.toggle("up",deep);home.setAttribute("aria-label",deep?"上一頁":"首頁");
  home.innerHTML=ico(deep?"back":"home","solo");
  if(!reduceMotion()&&home.isConnected)home.firstElementChild.animate([{opacity:0,transform:deep?"translateX(8px)":"scale(.8)"},{opacity:1,transform:"none"}],{duration:260,easing:"cubic-bezier(.2,.9,.25,1)"});
}
/* 左上鍵（首頁／上一頁）：更深的頁面＝退一層；主頁＝離開看板。設定面板裡改到一半的內容（標籤、人員…）退出時才存（nav.js 的 paneJob），
   存檔還沒完成就離開頁面會丟掉，所以離開前先等 paneJob 結束；連按也一樣（第二下變成首頁鍵時，存檔還在跑）。 */
let homeLeaving=false;
document.addEventListener("click",async e=>{
  const a=e.target.closest&&e.target.closest(".dhead .dh-home");if(!a||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  if(homeDeep()){e.preventDefault();e.stopPropagation();homeUp();return}
  if(!paneJob)return;   /* 沒有未完成的存檔：照一般連結（pagefx.js 的站內換頁）離開 */
  e.preventDefault();e.stopPropagation();if(homeLeaving)return;
  homeLeaving=true;try{await paneJob}catch(_){}homeLeaving=false;
  if(!homeDeep())PageFx.leave(a.href);   /* 等的時候又打開了別層：不離開 */
},true);
function renderHero(){
  const home=$(".dhead .dh-home"),eye=$("#peekBtn"),nb=$("#notiBtn");if(!home)return;
  homeSync();   /* 骨架（shell.js）載入時還沒有 icon 可用，第一次畫時補上；之後依層級換首頁／上一頁 */
  if(!eye.firstElementChild)eye.innerHTML=ico("eye","solo");
  if(!nb.querySelector(".ico"))nb.insertAdjacentHTML("afterbegin",ico("bell","solo"));
  if(roView&&!deptCan())roView=false;   /* 登出、權限被撤掉：唯讀檢視跟著結束 */
  Anim.toggle($("#dhRo"),deptRO());
  Anim.toggle(eye,deptCan());eye.setAttribute("aria-pressed",String(roView));eye.classList.toggle("on",roView);
  Anim.toggle(nb,!deptRO());
  if(notiOpen&&deptRO())closeNoti(true);   /* 通知與行事曆那一頁開著時變成唯讀（唯讀檢視、權限被撤）：直接回原分頁（notify.js） */
  if(setOpen&&roView)closeSettings(true);   /* 設定開著時按眼睛鈕（ui-09 起設定是部門內的一頁，標題列按得到）：唯讀檢視沒有設定鍵，設定直接收起（面板裡改到一半的照離開處理） */
  hsBar();   /* 搜尋列（search.js）：只在即時回報、進度、完成紀錄三頁 */
  weekDotSync();
}

function renderWeeks(){
  const ws=[...state.weeks].sort((a,b)=>b.date.localeCompare(a.date));
  if(!openWeeks&&ws.length)openWeeks=new Set([ws[0].id]);
  const lines=t=>String(t||"").split("\n").map(l=>`<span class="wl">${l.trim()?esc(l):"&nbsp;"}</span>`).join("");
  $("#weekList").innerHTML=ws.map((w,k)=>`<details class="week ${w.id===newWeekId?"new":""}" data-week="${esc(w.id)}" ${openWeeks&&openWeeks.has(w.id)?"open":""}>
      <summary><span class="num">${esc(fmt(w.date))}</span>${k===0?'<span class="badge">最新</span>':""}${fsDelOk()?`<button type="button" class="icon danger auth-only week-del" data-delweek aria-label="刪除 ${esc(fmt(w.date))} 的週報">刪除</button>`:""}</summary>
      <div class="week-tools"><button type="button" class="icon" data-copyweek>複製文字</button><button type="button" class="icon auth-only" data-editweek>${ico("edit")}編輯</button></div>
      <div class="week-text">${lines(w.text)}</div></details>`).join("")
    ||`<p class="empty">還沒有週報。${boardLocked()?"":"登入後按「+ 新增週報」貼上本週文字，或按「生成週報」。"}</p>`;
}

/* 細刻度（會長室追蹤、工作報告的期間甘特圖用；看板的甘特圖從 ui-12 起改用滑桿式時程條 sliderHTML）：n 根細直線排滿整條；s～e＝議題期間（%），t＝今天（%；在範圍外就給 -1 或 101）。
   期間外＝淡色短刻度、期間內已過＝深色長刻度、期間內還沒到＝灰色中刻度、今天那一根＝綠色最高 */
function ticksHTML(n,s,e,t){
  const half=50/n;let h="";
  for(let i=0;i<n;i++){const p=(i+.5)/n*100,inR=p>=s-half&&p<=e+half,now=inR&&Math.abs(p-t)<=half;h+=`<i class="${now?"now":!inR?"":p<t?"on":"in"}"></i>`}
  return `<div class="tk" aria-hidden="true">${h}</div>`;
}
let ganttSeg=null;
let ganttSel=null;   /* 甘特圖上「選中的議題」＝最後打開過詳情的那一個（progShow 記下；只在這次開頁有效、不存）：時程條的已過段用選中色 */
function renderGantt(){
  $("#rStart").value=state.range.start;$("#rEnd").value=state.range.end;
  /* 全部／上學期／下學期：液態分段切換（anim.js 的 LiquidSeg）；在骨架裡、不跟著重畫，換的時候舊圖淡出、新圖淡入 */
  if(!ganttSeg&&$("#gTerm"))ganttSeg=new LiquidSeg($("#gTerm"),{onPick:k=>{Anim.swap($("#gantt"),()=>{ganttTerm=k;renderGantt();layoutAll()},"fade")}});
  if(ganttSeg&&!ganttTerm&&ganttSeg.cur!==["all","up","down"].indexOf(gTermNow()))ganttSeg.set(gTermNow(),true);   /* 還沒臨時切過：跟著設定的學期 */
  const ms=months(),tp=pos(today()),[s0,e0]=rangeMs(),inRange=Date.now()>s0&&Date.now()<e0;
  /* 上學期／下學期只列期間碰到那段的議題；「全部」與還沒填期間的照舊全列 */
  const act=activeIssues(),inView=i=>gTermNow()==="all"||!hasDates(i)||(([a,b])=>pd(a).getTime()<e0&&pd(b).getTime()>=s0)(issueSpan(i));
  const all=act.filter(inView),list=all.filter(hasDates),undated=all.filter(i=>!hasDates(i));
  const narrow=innerWidth<640,nameW=narrow?104:170;
  /* 手機看單一學期（6 個月）時，時間軸剛好塞進畫面寬，不用左右滑（2026-11-06）；看「全部」照舊依月份數加寬、可以左右滑 */
  const fit=narrow&&gTermNow()!=="all",avail=Math.max(220,($("#gantt").clientWidth||360)-nameW-14);   /* 14：列的左右內距，不然會多出一點點要滑 */
  const width=fit?avail:Math.max(narrow?360:640,ms.length*(narrow?84:130));
  /* 每一列＝滑桿式時程條（ui-12，DESIGN.md 第八節；跟議題詳情同一個元件 sliderHTML）：條只畫在議題期間，把手＝今天在期間的位置。
     今天＝每列一條細綠線（在條的後面，從把手上下露出來），時間軸上方綠色小膠囊寫日期 */
  const grid=inRange?`<span class="today" style="left:${tp}%"></span>`:"";
  let h=`<div style="min-width:${width+nameW}px"><div class="g-row"><div class="g-name g-nh sub">議題</div><div class="g-axis">${inRange?`<span class="today-tag" style="left:${tp}%">今天 ${fmt(today()).slice(5)}</span>`:""}${ms.map((m,k)=>`<span style="left:${pos(ymd(m))}%">${!fit&&(k===0||m.getMonth()===0)?m.getFullYear()+"/":""}${m.getMonth()+1}月</span>`).join("")}</div></div>`;
  h+=list.map(it=>{
    let s=it.start,e=it.end;if(e<s)[s,e]=[e,s];
    /* p：把手的位置（%）＝今天在條上的位置，不四捨五入（才跟今天線對齊）；還沒開始＝0（把手在最左）、已經結束＝100（最右）。
       期間超出時間軸範圍時條被切在範圍邊緣，把手照樣對齊今天線 */
    const l=pos(s),r=pos(e),w=Math.max(.8,r-l),p=r>l?clamp((tp-l)/(r-l)*100):tp>=l?100:0;
    /* 註記（DESIGN.md 第八節：不用小圓點）：最新一筆＝深色膠囊標籤＋細線連到條；其他＝條上方的短線（位置照日期，滑過才顯示標籤）；還沒勾的處理紀錄 .pend 半透明 */
    const gL=latestMarkerId(it.markers.filter(m=>m.date));const mk=it.markers.filter(m=>m.date).map(m=>{const x=pos(m.date);return `<span class="g-mk ${x<6?"edgeL":x>94?"edgeR":""} ${m.id!==gL?"quiet":""}${mkPending(m)?" pend":""}" style="left:${x}%"><span class="stem"></span><span class="lbl">${esc(m.text)}</span></span>`}).join("");
    return `<div class="g-row g-issue" data-jump="${esc(it.id)}" data-fk="g${esc(it.id)}"><div class="g-name"><a href="#" data-jump="${esc(it.id)}">${esc(it.title)}</a><span class="sub" style="font-size:11.5px">${esc(fmt(s).slice(5))} – ${esc(fmt(e).slice(5))}</span></div>
      <div class="g-track">${grid}${sliderHTML(it,{l,w,p,sel:it.id===ganttSel})}${mk}</div></div>`;
  }).join("");
  /* 還沒填期間的議題也列出來（沒有條），才點得到詳情去補日期 */
  h+=undated.map(it=>`<div class="g-row g-issue g-undated" data-jump="${esc(it.id)}" data-fk="g${esc(it.id)}"><div class="g-name"><a href="#" data-jump="${esc(it.id)}">${esc(it.title)}</a><span class="sub" style="font-size:11.5px">未排程</span></div><div class="g-track">${grid}</div></div>`).join("");
  h+="</div>";
  /* 空狀態：唯讀＝「目前沒有進行中的議題」；已登入＝只寫狀態（DESIGN.md「介面不放教學說明文字」；ui-11）；github 模式還沒登入的照舊 */
  if(!act.length)h+=`<p class="empty">${boardLocked()?"目前沒有進行中的議題。":loggedIn()?"還沒有議題。":"還沒有議題，登入後按「+ 議題」開始。"}</p>`;
  else if(!all.length)h+=`<p class="empty">這段期間沒有議題。</p>`;
  morphTo($("#gantt"),h);   /* 原位更新（morph.js）：沒變的列、時程條、註記都是同一個節點 */
}

/* 階段標籤與連結按鈕（只顯示；編輯中改用逐欄編輯的「階段」「超連結」欄） */
function tagsHTML(it){return it.tags.map((g,k)=>`<span class="tag ${k===it.cur?"cur":k<it.cur?"past":""}">${esc(g)}</span>`).join("")}
function linkHTML(l){return `<a class="link" style="--c:${cssColor(l.color)}" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.name)}</a>`}
function latestMarkerId(list){
  const dated=list.filter(m=>m.date).sort((a,b)=>a.date.localeCompare(b.date)||a.at-b.at);
  const pick=dated.length?dated[dated.length-1]:[...list].sort((a,b)=>a.at-b.at).pop();
  return pick&&pick.id;
}
function markerHTML(m,latest,it){
  const at=cssNum(mkAt(it,m),50),edge=at<18?"edgeL":at>82?"edgeR":"";
  return `<div class="marker ${m.pos==="down"?"down":"up"} ${edge} ${latest&&m.id!==latest?"quiet":""}" style="left:${at}%;--mc:${cssColor(m.color,MARK_COLORS[0])}" data-marker="${esc(m.id)}"><span class="stem"></span><span class="dot"></span><span class="lbl">${m.date?`<span class="num">${esc(fmt(m.date).slice(5))}</span> `:""}${esc(m.text)}</span></div>`;
}

const sortedMarkers=it=>[...it.markers].sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")||a.at-b.at);
function logHTML(it){
  const ms=sortedMarkers(it);if(!ms.length)return "";
  return `<details class="log" open><summary>處理紀錄<span class="count">${ms.length}</span></summary><ol>${ms.map(m=>`<li${mkPending(m)?' class="pend"':""}><span class="log-dot" style="background:${cssColor(m.color,MARK_COLORS[0])}"></span><span class="num log-d">${m.date?esc(fmt(m.date)):"—"}</span>${m.stage?`<span class="tag cur sm">${esc(m.stage)}</span>`:""}<span>${esc(m.text)}</span>${m.evId?`<span class="sub">（即時回報）</span>`:""}</li>`).join("")}</ol></details>`;
}

/* ---------- 滑桿式時程條（DESIGN.md／DESIGN-next 第八節：比照 Android Material 的音量滑桿；議題詳情與甘特圖每一列共用） ----------
   已過的一段、直立把手、還沒到的一段，三者之間留縫（外觀在 board.css「滑桿式時程條」）。
   議題詳情：整條＝開始日到結束日，把手中心＝時程百分比（schedPct，跟「時程 N%」同一個數）；未排程沒有把手、整條是還沒到的那段。
   條上放名稱與百分比、負責人（每人一格，名字第一個字）；位置由 slFit 依實際寬度決定，動畫在 slAnim。
   g（甘特圖的一列，renderGantt）＝{l,w,p,sel}：條只畫在議題期間（left l%、寬 w%）、把手在 p%、sel＝選中的議題（已過段用選中色）；緊湊尺寸（.g），不放名稱、百分比、負責人（名稱在左邊那欄）。
   把手在 0（還沒開始）／100（已經結束）時加 at0／at100：沒有長度的那一段不畫 */
const SL_HW=5,SL_GAP=5,SL_PAD=14,SL_END=22,SL_CW=24,SL_CG=4;   /* 跟 board.css 同一組（議題詳情的尺寸）：把手寬、縫、文字內距、右端小點、負責人一格的寬與間距（「+N」的寬照實際量，slFit）；把手高出條多少照 CSS 的 --sl-ov 讀（layoutTrack） */
function sliderHTML(it,g){
  const p=g?Math.round(g.p*1000)/1000:schedPct(it),names=g?[]:staffNames(it.staff);
  const cls=(g?"g-bar g":"c-bar")+" sl"+(p==null?" none":p<=0?" at0":p>=100?" at100":"")+(g&&g.sel?" sel":"");
  return `<div class="${cls}" style="${g?`left:${cssNum(g.l)}%;width:${cssNum(g.w)}%;`:""}--p:${cssNum(p,0)}%" data-p="${p==null?"":cssNum(p,0)}" aria-hidden="true">
        <span class="sl-a"></span><span class="sl-h"></span><span class="sl-b"></span>
        ${g?"":`<span class="sl-lb"><b>${esc(it.title)}</b><i class="num">${p==null?"未排程":cssNum(p,0)+"%"}</i></span>`}
        ${names.length?`<span class="sl-avs">${names.map(n=>`<span class="sl-av">${esc(Array.from(n)[0]||"")}</span>`).join("")}<span class="sl-av sl-more num" hidden></span></span>`:""}
      </div>`;
}
/* 名稱與百分比不能被把手蓋住：先放比較長的那一段裡（已過＝lb-a、還沒到＝lb-b，另一段放得下就換過去），兩段都放不下移到條的上方（lb-up）。
   負責人靠還沒到那段的右端；放不下時前面幾格照放、其餘收成「+N」，連「+N」都放不下就不放（手機一律不放，看下面議題區塊的專員列）。
   回傳名稱移到上方時要多留的高度（layoutTrack 用） */
function slFit(bar){
  const W=bar.clientWidth,none=bar.dataset.p==="",x=none?0:cssNum(bar.dataset.p)/100*W;
  const a=none?0:x-SL_HW/2-SL_GAP,b=none?W:W-x-SL_HW/2-SL_GAP;
  const lb=bar.querySelector(".sl-lb"),lw=lb.offsetWidth,box=bar.querySelector(".sl-avs");
  const chips=box&&getComputedStyle(box).display!=="none"?[...box.querySelectorAll(".sl-av:not(.sl-more)")]:[],more=box&&box.querySelector(".sl-more");
  let mw=0;if(chips.length){more.textContent="+"+chips.length;more.hidden=false;mw=more.offsetWidth}   /* 「+N」的寬照實際量（N 最多是全部人數，兩位數也放得下） */
  const avMin=chips.length?mw+8:0;   /* 名稱跟負責人擠在還沒到那段時，至少留一格「+N」 */
  let at="up";
  for(const k of !none&&x>=W/2?["a","b"]:["b","a"])if(lw<=(k==="a"?a-2*SL_PAD:b-SL_PAD-SL_END-avMin)){at=k;break}
  ["a","b","up"].forEach(k=>bar.classList.toggle("lb-"+k,k===at));
  if(chips.length){
    const room=b-SL_END-SL_PAD-(at==="b"?lw+8:0),n=chips.length;
    let k=n*(SL_CW+SL_CG)-SL_CG<=room?n:Math.floor((room-mw)/(SL_CW+SL_CG));
    const fit=k>=0;k=Math.max(0,k);
    chips.forEach((c,i)=>{c.hidden=!fit||i>=k});
    more.hidden=!fit||k>=n;more.textContent=fit&&k<n?`+${n-k}`:"";
  }
  return at==="up"?lb.offsetHeight+6:0;
}
/* 把手從 from（百分比）滑到現在的位置，兩段跟著伸縮（只動 transform；from＝0 是剛打開詳情的進場）。關掉動態時直接到結果 */
function slAnim(bar,from){
  if(!bar||reduceMotion()||bar.dataset.p==="")return;
  const W=bar.clientWidth,to=cssNum(bar.dataset.p);if(!W||from===to)return;
  const seg=p=>[Math.max(0,p/100*W-SL_HW/2-SL_GAP),Math.max(0,W-p/100*W-SL_HW/2-SL_GAP)],[a0,b0]=seg(from),[a1,b1]=seg(to);
  const o={duration:MO.slow,easing:"cubic-bezier(.25,1.12,.4,1)"},q=s=>bar.querySelector(s);
  q(".sl-h").animate([{transform:`translateX(${(from-to)/100*W}px)`},{transform:"none"}],o);
  if(a1>0)q(".sl-a").animate([{transform:`scaleX(${a0/a1})`},{transform:"none"}],o);
  if(b1>0)q(".sl-b").animate([{transform:`scaleX(${b0/b1})`},{transform:"none"}],o);
  q(".sl-lb").animate([{opacity:0},{opacity:1}],{duration:MO.base,delay:MO.fast,easing:MO.out,fill:"backwards"});
}

/* stack marker labels into lanes so many markers never overlap */
const LH=22;
function layoutTrack(tr){
  const isG=tr.classList.contains("g-track"),W=tr.clientWidth;if(!W||!tr.querySelector(".g-bar,.c-bar"))return;   /* 未排程的甘特列沒有條 */
  /* 滑桿式時程條：把手比條上下各高出 ov（CSS 的 --sl-ov，議題詳情與甘特圖的緊湊尺寸不同）；議題詳情的名稱與百分比移到條上方時再多 lift，註記都往上讓 */
  const sl=tr.querySelector(".sl"),lift=sl&&!isG?slFit(sl):0,ov=sl?cssNum(parseFloat(getComputedStyle(sl).getPropertyValue("--sl-ov")),0):0;
  const barH=sl?sl.offsetHeight:16,dotH=isG?0:16,gap=isG?3:4;   /* 註記都放在條的「上方」、不疊在條上：甘特圖沒有小點（標籤或短線）；議題詳情是 16px 細長條（2026-11-06 使用者：長條疊在刻度上又半透明很粗糙） */
  const lanes={up:[],down:[]},info=[];
  [...tr.querySelectorAll(isG?".g-mk":".marker")].sort((a,b)=>parseFloat(a.style.left)-parseFloat(b.style.left)).forEach(m=>{
    const side=!isG&&m.classList.contains("down")?"down":"up";
    const lbl=m.querySelector(".lbl"),w=lbl.offsetWidth,x=parseFloat(m.style.left)/100*W;
    const s=m.classList.contains("edgeL")?x-(isG?8:10):m.classList.contains("edgeR")?x-w+(isG?8:10):x-w/2;
    if(m.classList.contains("quiet")){info.push({m,lbl,side,k:0,quiet:true});return}
    const L=lanes[side];let k=L.findIndex(end=>end+6<=s);if(k<0){k=L.length;L.push(0)}L[k]=s+w;
    info.push({m,lbl,side,k});
  });
  const nUp=lanes.up.length,nDown=lanes.down.length;
  const barTop=(isG?6:8)+nUp*LH+(nUp?6:(isG?2:18))+(isG?0:dotH+gap-10)+ov+lift;   /* 議題詳情多留長條的高度；甘特圖沒有註記的列只留把手高出的部分 */
  const below=barTop+barH+ov+(isG?6:20),top0=barTop-ov-lift;   /* top0：條（含把手、上方的名稱）的頂端 */
  tr.querySelector(isG?".g-bar":".c-bar").style.top=barTop+"px";
  tr.querySelectorAll(".tick").forEach(t=>t.style.top=(barTop+barH+ov+3)+"px");
  info.forEach(({m,lbl,side,k,quiet})=>{
    const dot=m.querySelector(".dot"),stem=m.querySelector(".stem");
    if(dot)dot.style.top=(top0-dotH-gap)+"px";   /* 甘特圖的註記沒有小點 */
    if(side==="up"){const base=isG?barTop-ov:top0-dotH-gap,top=base-6-(k+1)*LH+2;lbl.style.top=top+"px";stem.style.top=(top+18)+"px";stem.style.height=Math.max(0,(isG?barTop:base)-top-18)+"px"}   /* 甘特圖：標籤讓開把手，細線一路連到條 */
    else{const top=below+k*LH;lbl.style.top=top+"px";stem.style.top=(barTop+barH)+"px";stem.style.height=Math.max(0,top-barTop-barH)+"px"}
    if(isG&&quiet){stem.style.top=(barTop-9)+"px";stem.style.height="7px"}   /* 甘特圖不是最新一筆的註記：條上方 7px 的短線 */
  });
  tr.style.height=(nDown?below+nDown*LH+4:below+(isG?0:4))+"px";
  if(isG){const row=tr.parentElement,H=tr.offsetHeight,pt=Math.max(0,2*(barTop+barH/2)-H-8);row.style.setProperty("--g-pt",pt+"px");row.style.setProperty("--g-pb","0px")}   /* 甘特圖：名稱對齊條的中線（board.css .g-name） */
}
const layoutAll=()=>document.querySelectorAll(".c-track,.g-track").forEach(layoutTrack);
let _rz;window.addEventListener("resize",()=>{clearTimeout(_rz);_rz=setTimeout(layoutAll,120)});
document.fonts?.ready.then(layoutAll);

/* 議題詳情（#cardDetail）的那一張議題卡片；只畫在詳情裡，一律展開 */
function cardHTML(it){
  const nm=!!inm&&inm.id===it.id&&cardEd("i",it.id),ed=cardEd("i",it.id)&&!nm;   /* nm：只在改名稱（原位編輯，events.js 的 inmCommit）；ed：整張卡片編輯中 */
  return `<article class="card open ${it.doneAt?"closed":""} ${ed?"sec-edit":""}" data-issue="${esc(it.id)}" data-edbox="i:${esc(it.id)}">
    <div class="card-top">
      <div class="card-head">${nm?`<input class="card-title" data-iname value="${esc(it.title)}" maxlength="500" aria-label="議題名稱" autocomplete="off" enterkeyhint="done">`:`<b class="card-title"${canEdit()&&!editing?` data-iname-go tabindex="0" role="button"`:""}>${esc(it.title)}</b>`}${it.tags[it.cur]?`<span class="tag cur sm">${esc(it.tags[it.cur])}</span>`:""}${it.doneAt?'<span class="tag sm closed-tag">已結案</span>':""}<span class="hpct num${schedPct(it)==null?" none":""}" data-hpct>${schedPct(it)==null?"未排程":`<small>時程</small>${schedPct(it)}%`}</span></div>
      ${editBtnHTML("i:"+it.id)}<div class="card-tools"><button type="button" class="icon" data-addmarker>+ 註記</button><button type="button" class="icon" data-closeissue>${it.doneAt?"取消結案":"結案"}</button><button type="button" class="icon" data-move="-1" aria-label="往前移">↑</button><button type="button" class="icon" data-move="1" aria-label="往後移">↓</button>${fsDelOk()?`<button type="button" class="icon danger" data-delissue aria-label="刪除議題「${esc(it.title)}」">刪除</button>`:""}</div>
    </div>
    ${ed?issueFieldsHTML(it):`<div class="meta"><span class="sub">${hasDates(it)?`${esc(fmt(it.start))} – ${esc(fmt(it.end))}`:"未排入甘特圖"}</span></div>
    <div class="tags">${tagsHTML(it)}</div>
    ${staffHTML(it.staff)}${labelChipsHTML(it.labels)}
    ${it.note?`<p class="note"><span class="note-h">目前進度</span>${esc(it.note)}</p>`:""}`}
    <div class="c-track" data-track>
      ${sliderHTML(it)}
      ${hasDates(it)?issueSpan(it).map((d,k)=>`<span class="tick ${k?"tick-e":"tick-s"}" style="left:${k*100}%">${esc(fmt(d).slice(5))}</span>`).join(""):""}
      ${(()=>{const L=latestMarkerId(it.markers);return it.markers.map(m=>markerHTML(m,L,it)).join("")})()}
    </div>
    ${(()=>{const kids=state.events.filter(e=>!e.doneAt&&e.issueId===it.id);return kids.length?`<div class="kid-evs"><div class="att-h">進行中的即時回報</div><div class="kid-list">${kids.map(e=>`<span class="kid-ev" data-st="${evStatus(e)}"><span class="live-dot" aria-hidden="true"></span>${esc(e.name)}</span>`).join("")}</div></div>`:""})()}
    ${logHTML(it)}
    ${ed||!it.links.length?"":`<div class="att"><div class="att-h">相關連結</div><div class="links">${it.links.map(linkHTML).join("")}</div></div>`}
    ${ed?editBarHTML():""}
  </article>`;
}
/* ---------- 進度、完成紀錄的逐欄編輯（跟即時回報同一套外觀與操作：點哪一欄改哪一欄、一次一欄、Enter 完成、Esc 取消） ----------
   按了卡片的「編輯」之後才能改（render.js 的單卡編輯）。
   ifFld＝{t,id,k}：t＝"i"（議題，含已結案的）或 "e"（完成紀錄裡的即時回報）；
   k＝title／stage／note／dates／staff／labels／l:連結 id（l:+＝新增）／done（完成日期）／name／desc／issue（母議題）。
   存回在 events.js 的「進度、完成紀錄的逐欄編輯」段 */
let ifFld=null;
/* 議題名稱的原位編輯（events.js 的 inmStart／inmCommit）：inm＝{id,isNew,orig（開始改名時的原名，判斷有沒有改用）}，只開名稱這一欄（用同一套單卡編輯開始，沒有「取消｜儲存」） */
let inm=null;
const ifOpen=(t,id,k)=>!!ifFld&&ifFld.t===t&&ifFld.id===id&&ifFld.k===k;
function ifFieldHTML(t,id,k,label,view,editor){return fldRowHTML({open:ifOpen(t,id,k),k,label,view,editor,del:/^l:(?!\+)/.test(k),key:"iffk",pen:"ifpen",fx:"iffx",attr:`data-ift="${esc(t)}" data-ifid="${esc(id)}"`})}
/* 欄位沒有內容時的灰字：不用全形括號（2026-11-06 使用者：文字要視覺上對齊——全形「（」左邊自帶半格空白，整欄看起來往右縮） */
const noneTxt=t=>`<span class="sub">${t}</span>`;
/* 階段：每一列一個階段（可改名、刪除），「目前」選這個議題現在在哪個階段；「+ 階段」在最後加一列 */
const stageRowHTML=(g,cur)=>`<span class="stg-row"><button type="button" class="stg-cur" data-iffx="stgcur" aria-pressed="${cur}">目前</button><input data-stg value="${esc(g)}" placeholder="階段名稱"><button type="button" class="icon stg-del" data-iffx="stgdel" aria-label="刪除這個階段">${ico("close","solo")}</button></span>`;
function stageEditorHTML(it){return `<div class="stg-list">${it.tags.map((g,k)=>stageRowHTML(g,k===it.cur)).join("")}</div><button type="button" class="ghost evd-add" data-iffx="stgadd">+ 階段</button><span class="sub evf-hint">按「目前」選這個議題現在在哪個階段；空白的階段會拿掉</span>`}
/* 議題詳情（編輯中）的欄位 */
function issueFieldsHTML(it){
  const F=(k,l,v,e)=>ifFieldHTML("i",it.id,k,l,v,e);
  return `<div class="evfs">
      ${F("title","名稱",`<b>${esc(it.title)}</b>`,()=>`<input data-e="title" value="${esc(it.title)}">`)}
      ${F("stage","階段",it.tags.length?`<span class="tags">${tagsHTML(it)}</span>`:noneTxt("沒有階段"),()=>stageEditorHTML(it))}
      ${F("note","目前進度",it.note?`<span class="evf-desc">${esc(it.note)}</span>`:noneTxt("沒有說明，點一下填寫"),()=>`<textarea data-e="note" rows="3">${esc(it.note||"")}</textarea>`)}
      ${F("dates","期間",hasDates(it)?`<span class="num">${esc(fmt(it.start))} – ${esc(fmt(it.end))}</span>`:noneTxt("未排程，點一下填開始與結束日"),()=>`<span class="evf-when"><input type="date" data-e="start" value="${esc(it.start)}" aria-label="開始日"><span class="sub">～</span><input type="date" data-e="end" value="${esc(it.end)}" aria-label="結束日"></span><span class="sub evf-hint">兩個日期都填才會顯示在甘特圖；清空就從甘特圖移除</span>`)}
      ${state.members.length?F("staff","專員",staffNames(it.staff).map(n=>`<span class="staff-chip">${esc(n)}</span>`).join("")||noneTxt("沒有標專員"),()=>fieldHTML({name:"staff",label:"從本看板的身分挑選，可複選",type:"multi",value:it.staff||[],options:staffOpts()})):""}
      ${F("labels","標籤",labelChipsHTML(it.labels)||noneTxt("沒有標籤"),()=>labelPickerHTML("labels",it.labels))}
      <div class="evf-group"><span class="evf-l">超連結</span>
        ${it.links.map(l=>F("l:"+l.id,"",`<span class="link" style="--c:${cssColor(l.color)}">${esc(l.name)}</span><span class="sub evf-url">${esc(l.url)}</span>`,()=>linkEditorHTML(l,it.links.length,"iffx"))).join("")}
        ${ifOpen("i",it.id,"l:+")?F("l:+","","",()=>linkEditorHTML(null,it.links.length,"iffx")):`<button type="button" class="ghost evd-add" data-ifpen="l:+" data-ift="i" data-ifid="${esc(it.id)}">+ 超連結</button>`}</div>
    </div>`;
}
/* 完成紀錄（編輯中）的欄位：議題＝名稱、完成日期、說明；即時回報＝名稱、完成日期、說明、母議題 */
function doneFieldsHTML(o,isEv){
  const t=isEv?"e":"i",nk=isEv?"name":"title",dk=isEv?"desc":"note",F=(k,l,v,e)=>ifFieldHTML(t,o.id,k,l,v,e),par=isEv&&parentOf(o);
  const opts=[["","（不連結）"],...state.issues.map(i=>[i.id,i.title+(i.doneAt?"（已結案）":"")])];
  return `<div class="evfs">
      ${F(nk,"名稱",`<b>${esc(o[nk])}</b>`,()=>`<input data-e="${nk}" value="${esc(o[nk])}">`)}
      ${isEv&&fsMode()?"":F("done","完成日期",`<span class="num">${esc(fmt(o.doneAt))||"—"}</span>`,()=>`<input type="date" data-e="done" value="${esc(o.doneAt)}">`)}
      ${F(dk,"說明",o[dk]?`<span class="evf-desc">${esc(o[dk])}</span>`:noneTxt("沒有說明，點一下填寫"),()=>`<textarea data-e="${dk}" rows="3">${esc(o[dk]||"")}</textarea>`)}
      ${isEv?F("issue","母議題",par?esc(par.title):noneTxt("不連結"),()=>fieldHTML({name:"evIssue",label:"完成紀錄會寫進這個議題的處理紀錄",type:"select",value:o.issueId||"",options:opts})):""}
    </div>`;
}
/* 進度卡片的詳情頁：progOpen＝正在看的議題 id（null＝看甘特圖）。議題不見了（刪除、結案後儲存）就自動回甘特圖 */
function renderCards(){
  if(!editing){ifFld=null;inm=null}
  const it=progOpen&&activeIssues().find(i=>i.id===progOpen);
  if(progOpen&&!it)progOpen=null;
  $("#ganttEdBtn").hidden=!!it||!fsSecOk("s:gantt");   /* 甘特圖時間軸的「編輯」只在看甘特圖時出現；firestore 模式要部門管理員以上（render.js 的 fsSecOk） */
  const b0=$("#cardDetail .sl"),was=b0&&b0.closest("[data-issue]").dataset.issue===(it&&it.id)?b0.dataset.p:"";
  morphTo($("#cardDetail"),it?cardHTML(it):"");   /* 原位更新（morph.js）：議題詳情編輯中的欄位不失焦 */
  if(was!=="")slAnim($("#cardDetail .sl"),cssNum(was));   /* 同一個議題的時程變了（改了期間）：把手滑到新位置 */
  $("#pvGantt").hidden=!!it;$("#pvDetail").hidden=!it;$("#progPanel").classList.toggle("pv-on",!!it);   /* pv-on：議題詳情那一頁（標題列的分段切換與「+ 議題」藏起來，board.css「進度頁標題列」） */
}
/* 甘特圖 ⇄ 詳情切換：原本的畫面往下淡出，新的畫面往上淡入（id＝要看的議題，null＝回甘特圖） */
let pvTok=0;
const pvIn=el=>{if(!reduceMotion())el.animate([{opacity:0,transform:"translateY(16px)"},{opacity:1,transform:"none"}],{duration:340,easing:"cubic-bezier(.2,.9,.25,1)"})};   /* 換上來的那一頁往上淡入 */
function progShow(id,then){   /* then：換好畫面後要做的事（例如新增議題後把游標放進名稱欄） */
  if(id===progOpen&&!then&&!$(id?"#pvDetail":"#pvGantt").hidden)return;   /* 已經在那一頁（例如新增的議題沒有命名、點返回時已經回到甘特圖） */
  const tok=++pvTok,out=$(progOpen?"#pvDetail":"#pvGantt");
  [$("#pvGantt"),$("#pvDetail")].forEach(p=>p.getAnimations().forEach(a=>a.cancel()));
  const swap=()=>{if(tok!==pvTok)return;progOpen=id;homeSync();if(id)ganttSel=id;renderCards();if(!id)renderGantt();layoutAll();   /* 回到甘特圖：剛看過的議題是選中的那一列 */
    const sc=$("#pageMain"),d=$("#progPanel").getBoundingClientRect().top-sc.getBoundingClientRect().top-12;if(d<0)sc.scrollTop+=d;   /* 卡片頂端捲出畫面時捲回來 */
    pvIn($(id?"#pvDetail":"#pvGantt"));
    if(id)slAnim($("#cardDetail .sl"),0);   /* 時程條的把手從開始日滑到今天 */
    if(then)then()};
  if(reduceMotion()||out.hidden){swap();return}
  const a=out.animate([{opacity:1,transform:"none"},{opacity:0,transform:"translateY(12px)"}],{duration:160,easing:"cubic-bezier(.4,0,1,1)",fill:"forwards"});
  a.onfinish=()=>{swap();a.cancel()};
}

/* ===== 即時回報、完成紀錄、秘書處會議卡共用的小片段 =====
   即時回報專屬的畫面（膠囊、卡片、逐行內容、時間頁、整區 renderEvents）在 live.js。 */
/* 時間標記清單（即時回報區、完成紀錄、秘書處會議卡共用）；free＝只列沒有連到任何一行的（即時回報：連到行的畫在那一行上） */
function evTimesHTML(ev,free){
  const par=parentOf(ev),ts=free?evFreeTimes(ev):evTimesSorted(ev);if(!ts.length)return "";
  return `<ol class="ev-times">${ts.map(t=>`<li>${evTimeView(t,par)}</li>`).join("")}</ol>`;
}
/* 連結按鈕列 */
function evLinksHTML(ev){
  if(!ev.links.length)return "";
  return `<div class="links ev-links">${ev.links.map(l=>`<a class="link" style="--c:${cssColor(l.color)}" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join("")}</div>`;
}
/* ---------- 逐欄編輯（秘書處會議卡；議題、完成紀錄用同一套 fldRowHTML，見 issueFieldsHTML／doneFieldsHTML） ----------
   按了卡片的「編輯」之後，每一欄本身就是可以點的（滑過去底色微亮），點哪一欄只有那一欄變成輸入框，其他照常顯示。
   「完成」（或 Enter、或直接點別欄）存回，「取消」（或 Esc）放棄。即時回報卡不用這一套（原位編輯器，在 live.js）。
   一次只開一欄：evFld＝{ev:即時回報 id,k:欄位}；k＝name／desc／issue／staff／labels／t:時間標記 id／l:連結 id（t:+、l:+ 是新增）。
   存回在 events.js 的「逐欄編輯」段 */
let evFld=null;
const evFldOpen=(ev,k)=>!!evFld&&evFld.ev===ev.id&&evFld.k===k;
/* 一欄（即時回報、進度、完成紀錄共用）：標題＋內容（整個內容是一顆按鈕，點了就編這一欄）；打開時換成輸入框＋取消／完成。
   o＝{open,k,label,view,editor（函式，打開時才產生）,del（多一顆刪除）,key／pen／fx（data 屬性名：欄位、點內容、按鈕）,attr（外框多帶的屬性）} */
function fldRowHTML(o){
  const lb=o.label?`<span class="evf-l">${o.label}</span>`:"",at=o.attr?" "+o.attr:"";
  if(o.open)return `<div class="evf open" data-${o.key}="${esc(o.k)}"${at}>${lb}<div class="evf-ed">${o.editor()}</div>
        <div class="evf-btns">${o.del?`<button type="button" class="icon danger" data-${o.fx}="del">刪除</button><span class="evd-gap"></span>`:""}<button type="button" class="ghost" data-${o.fx}="cancel">取消</button><button type="button" class="primary" data-${o.fx}="ok">完成</button></div></div>`;
  return `<div class="evf" data-${o.key}="${esc(o.k)}"${at}>${lb}<button type="button" class="evf-v" data-${o.pen}="${esc(o.k)}">${o.view}</button></div>`;
}
function evFieldHTML(ev,k,label,view,editor,noDel){return fldRowHTML({open:evFldOpen(ev,k),k,label,view,editor,del:!noDel&&/^[tl]:(?!\+)/.test(k),key:"evfk",pen:"evpen",fx:"evfx"})}
/* 時間的文字：「日期 時刻 名稱 期間 · 地點」（顯示與編輯中共用） */
function evTimeView(t,par){const x=evTimeText(t);
  return `<span class="num ev-t-when">${esc(x.when)}</span><span class="ev-t-label">${esc(t.label)}</span>${x.span?`<span class="sub num">${esc(x.span)}</span>`:""}${t.place?`<span class="ev-t-place">· ${esc(t.place)}</span>`:""}${t.toIssue&&par?`<span class="sub">（母議題）</span>`:""}`}
/* 時間標記的輸入框（名稱、日期、時刻、結束、地點、寫進母議題） */
function evTimeEditor(ev,tm){
  const par=parentOf(ev),sp=x=>[(x||"").slice(0,10),(x||"").slice(11,16)],[sd,st]=tm?sp(tm.start):[today(),""],[ed,et]=tm?sp(tm.end):["",""];
  const inp=(k,v,ph,type)=>`<input ${type?`type="${type}"`:""} data-e="${k}" value="${esc(v||"")}" ${ph?`placeholder="${esc(ph)}"`:""}>`;
  return `${inp("label",tm&&tm.label,"名稱")}
          <span class="evf-when">${inp("sd",sd,"","date")}${inp("st",st,"時刻")}<span class="sub">～</span>${inp("ed",ed,"","date")}${inp("et",et,"時刻")}</span>
          <span class="sub evf-hint">只填日期＝一個日子；加時刻＝具體時間；填結束＝一段期間</span>
          <span class="evf-place">${inp("place",tm&&tm.place,"地點")}${placeQuickHTML()}</span>
          ${par?`<label class="fld-check"><input type="checkbox" data-e="toIssue" ${tm&&tm.toIssue?"checked":""}><span>也寫進母議題的處理紀錄</span></label>`:""}`;
}
/* 連結的輸入框（顏色、名稱、網址；即時回報、議題共用）：n＝目前幾個連結（新增時輪流選顏色），fx＝按鈕的 data 屬性名 */
function linkEditorHTML(l,n,fx){
  const c=cssColor(l?l.color:COLORS[n%COLORS.length]);
  return `<span class="evf-row"><button type="button" class="evf-sw" style="background:${c}" data-${fx}="color" data-c="${c}" aria-label="換顏色"></button><input data-e="name" value="${esc(l?l.name:"")}" placeholder="按鈕名稱"><input data-e="url" value="${esc(l?l.url:"")}" placeholder="https://" inputmode="url"></span>`;
}
/* 秘書處會議卡（編輯中）的欄位：名稱、說明、母議題、專員、標籤、時間標記、超連結，每一欄各自可以點 */
/* lim（2026-11-20，秘書處在 firestore 模式的會議編輯）：只能改名稱、說明、已有時間標記的內容（不能新增、刪掉時間標記）；
   母議題、專員、標籤、超連結照原樣顯示、不能改（規則 cards 的 meetingEdit、events 的 meetingEditOfReportedCard 只開放這些） */
function evFieldsHTML(ev,lim){
  const par=parentOf(ev),ts=evTimesSorted(ev);
  if(lim)return `<div class="evfs">
      ${evFieldHTML(ev,"name","名稱",`<b>${esc(ev.name)}</b>`,()=>`<input data-e="name" value="${esc(ev.name)}">`)}
      ${evFieldHTML(ev,"desc","說明",ev.desc?`<span class="evf-desc">${esc(ev.desc)}</span>`:noneTxt("沒有說明，點一下填寫"),()=>`<textarea data-e="desc" rows="4">${esc(ev.desc||"")}</textarea>`)}
      ${ts.length?`<div class="evf-group"><span class="evf-l">時間標記</span>${ts.map(t=>evFieldHTML(ev,"t:"+t.id,"",evTimeView(t,par),()=>evTimeEditor(ev,t),true)).join("")}</div>`:""}
    </div>${par?`<p class="ev-parent-full">母議題：${esc(par.title)}</p>`:""}${staffHTML(ev.staff)}${labelChipsHTML(ev.labels)}${evLinksHTML(ev)}`;
  const so=staffOptsFor(ev);
  const opts=[["","（不連結）"],...state.issues.map(i=>[i.id,i.title+(i.doneAt?"（已結案）":"")])];
  const staffChips=staffNames(ev.staff).map(n=>`<span class="staff-chip">${esc(n)}</span>`).join("");
  const lblChips=labelChipsHTML(ev.labels);
  return `<div class="evfs">
      ${evFieldHTML(ev,"name","名稱",`<b>${esc(ev.name)}</b>`,()=>`<input data-e="name" value="${esc(ev.name)}">`)}
      ${evFieldHTML(ev,"desc","說明",ev.desc?`<span class="evf-desc">${esc(ev.desc)}</span>`:noneTxt("沒有說明，點一下填寫"),()=>`<textarea data-e="desc" rows="4">${esc(ev.desc||"")}</textarea>`)}
      ${evFieldHTML(ev,"issue","母議題",par?esc(par.title):noneTxt("不連結"),()=>fieldHTML({name:"evIssue",label:"結案或完成一段時，會自動寫進這個議題的處理紀錄",type:"select",value:ev.issueId||"",options:opts}))}
      ${so.length||(ev.staff||[]).length?evFieldHTML(ev,"staff","專員",staffChips||noneTxt("沒有標專員"),()=>fieldHTML({name:"staff",label:fsMode()?"可複選":"從本看板的身分挑選，可複選",type:"multi",value:ev.staff||[],options:so.map(o=>[o[0],o[1]])})):""}
      ${evFieldHTML(ev,"labels","標籤",lblChips||noneTxt("沒有標籤"),()=>labelPickerHTML("labels",ev.labels))}
      <div class="evf-group"><span class="evf-l">時間標記</span>
        ${ts.map(t=>evFieldHTML(ev,"t:"+t.id,"",evTimeView(t,par),()=>evTimeEditor(ev,t))).join("")}
        ${evFldOpen(ev,"t:+")?evFieldHTML(ev,"t:+","",'',()=>evTimeEditor(ev,null)):`<button type="button" class="ghost evd-add" data-evpen="t:+">${ico("calendar")}+ 時間</button>`}</div>
      <div class="evf-group"><span class="evf-l">超連結</span>
        ${ev.links.map(l=>evFieldHTML(ev,"l:"+l.id,"",`<span class="link" style="--c:${cssColor(l.color)}">${esc(l.name)}</span><span class="sub evf-url">${esc(l.url)}</span>`,()=>linkEditorHTML(l,ev.links.length,"evfx"))).join("")}
        ${evFldOpen(ev,"l:+")?evFieldHTML(ev,"l:+","",'',()=>linkEditorHTML(null,ev.links.length,"evfx")):ev.links.length<StoreMap.LNK_MAX?`<button type="button" class="ghost evd-add" data-evpen="l:+">+ 超連結</button>`:""}</div>
    </div>`;
}
/* 完成紀錄（DESIGN-next 第七節「完成紀錄」）：一筆一顆膠囊（半透明、右邊完成日），點了打開卡片——跟即時回報同一套卡片外框（live.js 的 lcFrame），
   寬螢幕在右邊、其他全螢幕。完成的即時回報：狀態「完成」、負責人、完成日、逐行內容唯讀、編輯次數；結案的議題：完成日、期間、階段、處理紀錄、連結。
   有權限的人卡片最下面「編輯」＝原本的逐欄編輯（doneFieldsHTML；議題的「取消結案」、即時回報的「移回即時回報」照舊在編輯中，位置不變）。 */
function doneItems(){
  const ev=state.events.filter(e=>e.doneAt).map(e=>({id:e.id,k:"e",o:e,d:e.doneAt||"",title:evName(e)}));
  return doneIssues().map(i=>({id:i.id,k:"i",o:i,d:i.doneAt||"",title:i.title})).concat(ev).sort((a,b)=>b.d.localeCompare(a.d));
}
const doneLink=l=>`<a class="lnk" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.name)}</a>`;
/* 一筆完成紀錄的卡片（full＝全螢幕）；上一張／下一張只在同一週裡走 */
function doneCardHTML(id,full){
  const items=doneItems(),x=items.find(y=>y.id===id);if(!x)return "";
  const ids=items.filter(y=>wkStart(y.d)===wkStart(x.d)).map(y=>y.id),key=x.k+":"+x.id,ed=cardEd(x.k,x.id),o=x.o;
  const tail=ed?`<div class="lc-ops">${x.k==="e"?`<button type="button" class="icon danger" data-evdel>刪除</button>${o.fromEv?"":`<button type="button" class="icon" data-evundo>移回即時回報</button>`}`
      :`${fsDelOk()?`<button type="button" class="icon danger" data-deldone>刪除</button>`:""}<button type="button" class="icon" data-restore>取消結案</button>`}</div>${editBarHTML()}`
    :`<div class="ev-edrow">${editBtnHTML(key)}</div>`;
  if(x.k==="e")return lcLiveHTML(o,{k:"done",ids,full,edit:ed,tail,body:ed?doneFieldsHTML(o,true)+evTimesHTML(o):null});
  const body=ed?doneFieldsHTML(o,false):`${hasDates(o)?`<p class="sub">期間 <span class="num">${esc(fmt(o.start))} – ${esc(fmt(o.end))}</span></p>`:""}${o.note?`<p class="dn-note">${esc(o.note)}</p>`:""}
      ${o.tags.length?`<div class="tags">${o.tags.map((g,k)=>`<span class="tag ${k===o.cur?"cur":k<o.cur?"past":""}">${esc(g)}</span>`).join("")}</div>`:""}
      ${o.markers.length?`<ul class="dn-mk">${sortedMarkers(o).map(m=>`<li>${m.date?`<span class="num">${esc(fmt(m.date))}</span> `:""}${m.stage?`【${esc(m.stage)}】`:""}${esc(m.text)}</li>`).join("")}</ul>`:""}
      ${o.links.length?`<div class="lnks">${o.links.map(doneLink).join("")}</div>`:""}`;
  return lcFrame({k:"done",id:o.id,key,st:"done",ids,full,ro:true,sec:ed,attr:`data-issue="${esc(o.id)}"`,title:`<b class="lc-title">${esc(o.title)}</b>`,
    meta:`<span class="ev-st">完成</span>${lcWhen(o.doneAt)}<span>議題</span>`,body,tail,save:""});
}
/* ---------- 完成紀錄：一週一張資料夾 ----------
   完成紀錄先列「一週一張」的資料夾（週一到週日，最新的在最上面；沒有完成紀錄的週不出現），點一張進去是那一週的膠囊清單，卡片的開法沿用即時回報（live.js）。
   分週只看完成日（doneAt，日期字串）：同一張卡分段完成、結案在不同週，各自出現在完成那一週。資料不變，只在前端分組。
   doneWeek＝進去的那一週（週一的日期）；null＝資料夾總覽。進去的那一頁比部門主頁更深：登記在 Back（左上角鍵變「上一頁」、系統返回鍵關掉這一頁），頁面裡不另放返回鈕。 */
const wkStart=d=>addDays(d,-((pd(d).getDay()+6)%7));
const wkLabel=s=>`${fmt(s).slice(5)} – ${fmt(addDays(s,6)).slice(5)}`;
function doneWeeks(items){const m=new Map();items.forEach(x=>{const w=wkStart(x.d);if(!m.has(w))m.set(w,[]);m.get(w).push(x)});return [...m].sort((a,b)=>b[0].localeCompare(a[0]))}
/* 進去／離開那一週（只改狀態與 Back 登記，不畫） */
function wkSet(w){
  if(w===doneWeek)return;const was=doneWeek;doneWeek=w;
  if(w&&!was)Back.opened("doneweek",()=>doneWeekShow(null));else if(!w&&was)Back.closed("doneweek");
}
function doneWeekShow(w,{instant}={}){
  if(w===doneWeek)return;
  if(!w&&dnOpen){if(!lvWide())Back.closed("card");lcSet("done",null)}   /* 離開這一週時卡片一起收起來 */
  wkSet(w);renderDone();
  if(!instant&&!reduceMotion())pvIn($("#doneList"));
}
/* 要開某一筆（搜尋、其他地方跳過來）：先進到它那一週 */
function doneWeekFor(id){const x=doneItems().find(y=>y.id===id);if(x){wkSet(wkStart(x.d));renderDone()}}
function renderDone(){
  const items=doneItems(),ids=new Set(items.map(x=>x.id));
  const dnew=id=>prevDone&&!prevDone.has(id)?" new":"";
  if(dnOpen&&!ids.has(dnOpen))dnOpen=null;
  const open=dnOpen&&items.find(x=>x.id===dnOpen);
  if(open)wkSet(wkStart(open.d));   /* 卡片開著＝一定在它那一週 */
  else if(doneWeek&&!items.some(x=>wkStart(x.d)===doneWeek))wkSet(null);   /* 那一週的紀錄都不見了（移回、刪除） */
  const wide=lvWide(),split=wide&&!!dnOpen,pane=$("#doneDetail");
  $("#doneMD").classList.toggle("split",split);
  $("#doneCount").textContent=items.length;
  const cp=x=>`<button type="button" class="cp done${dnew(x.id)}${split&&x.id===dnOpen?" sel":""}${!wide&&x.id===dnOpen?" away":""}" data-cp="${esc(x.id)}" data-done="${esc(x.id)}" ${x.k==="e"?`data-ev="${esc(x.id)}"`:`data-issue="${esc(x.id)}"`} data-st="done"${split&&x.id===dnOpen?' aria-current="true"':""}><span class="live-dot" aria-hidden="true"></span><b>${esc(x.title)}</b><span class="cp-d num">${esc(fmt(x.d).slice(5))}</span></button>`;
  const thisWk=wkStart(today());
  const folder=([w,a])=>`<button type="button" class="wkf" data-wk="${esc(w)}" aria-label="${esc(wkLabel(w))}，完成 ${a.length} 張"><b class="wkf-d num">${esc(wkLabel(w))}</b><span class="wkf-n"><span><span class="num">${a.length}</span> 張完成${w===thisWk?" · 本週":w===addDays(thisWk,-7)?" · 上週":w.slice(0,4)!==thisWk.slice(0,4)?" · "+esc(w.slice(0,4)):""}</span></span><ul class="wkf-pv">${a.slice(0,3).map(x=>`<li>${esc(x.title)}</li>`).join("")}</ul>${a.length>3?`<span class="wkf-more">另 ${a.length-3} 張</span>`:""}</button>`;
  const inWk=doneWeek?items.filter(x=>wkStart(x.d)===doneWeek):[];
  morphTo($("#doneList"),!items.length?`<p class="empty">結案的議題和完成的即時回報會收進這裡。</p>`
    :doneWeek?`<div class="wk-head"><h3 class="num">${esc(wkLabel(doneWeek))}</h3><span>${inWk.length} 張完成</span></div><div class="cps">${inWk.map(cp).join("")}</div>`
    :`<div class="wkfs">${doneWeeks(items).map(folder).join("")}</div>`);   /* 原位更新（morph.js） */
  if(split){morphTo(pane,doneCardHTML(dnOpen,false));pane.hidden=false}else{pane.textContent="";pane.hidden=true}
  prevDone=ids;lcFullSync();Anim.syncPings();fabSync();   /* 打開的那一筆不見了（移回、刪除）時圓鈕要回來：renderEvents 先跑，這裡再對一次 */
}

