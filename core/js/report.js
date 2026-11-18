/* 核心｜工作報告：選期間 → 預覽（文字可直接修改；可加章節、文字／圖片／卡片圖塊）→ 列印成 PDF
   結構：封面、目錄、各章（預設：本期摘要〔數字＋期間甘特圖〕、議題處理情形〔逐案〕、工作檢討、下期規劃）
   預覽裡的字、上傳的圖片只用在這一份報告，不會存進看板、不會上傳。 */
let rptOpen=false,rptRange=null,rptDoc=null;   /* rptDoc：預覽的不是工作報告時（秘書處的會議紀錄，meeting.js）＝{label,k,file,html} */

/* ---------- 資料：期間內處理過的議題、即時回報、週報 ---------- */
function rptData(from,to){
  const inP=d=>!!d&&d>=from&&d<=to;
  const act=state.issues.filter(i=>(!i.doneAt||i.doneAt>to)&&(!i.start||i.start<=to));
  const done=state.issues.filter(i=>i.doneAt&&inP(i.doneAt)).sort((a,b)=>a.doneAt.localeCompare(b.doneAt));
  const extra=state.issues.filter(i=>!act.includes(i)&&!done.includes(i)&&i.markers.some(m=>inP(m.date)));
  const issues=[...act,...done,...extra];
  const evNew=state.events.filter(e=>!e.fromEv&&inP(e.createdAt)),evDone=state.events.filter(e=>inP(e.doneAt));
  return {from,to,inP,issues,nDone:issues.filter(i=>i.doneAt&&inP(i.doneAt)).length,nAct:issues.filter(i=>!(i.doneAt&&inP(i.doneAt))).length,evNew,evDone,evLinked:evDone.filter(e=>e.issueId).length,
    marks:issues.reduce((n,i)=>n+i.markers.filter(m=>inP(m.date)).length,0),weeks:state.weeks.filter(w=>inP(w.date))};
}

/* ---------- 期間甘特圖（只畫這段期間，超出的部分切掉） ---------- */
/* 報告裡的期間甘特圖（2026-11-06 使用者：套看板最新的樣子）：跟看板甘特圖同一種細刻度（views.js 的 ticksHTML、board.css 的 .tk），
   每列＝議題名稱、時程 %、一排刻度（期間外淡色短、期間內已過深色長、還沒到灰色中、今天綠色最高）；上面月份，今天在期間內就加綠色小膠囊 */
function rptGantt(d){
  const rows=d.issues.filter(i=>hasDates(i)&&(i.start<i.end?i.start:i.end)<=d.to&&(i.start<i.end?i.end:i.start)>=d.from);
  if(!rows.length)return "";
  const t0=pd(d.from).getTime(),t1=pd(d.to).getTime()+864e5,P=s=>Math.max(0,Math.min(100,(pd(s).getTime()-t0)/(t1-t0)*100));
  const ms=[],m=pd(d.from);m.setDate(1);if(m.getTime()<t0)m.setMonth(m.getMonth()+1);
  while(m.getTime()<t1){ms.push(ymd(m));m.setMonth(m.getMonth()+1)}
  const td=today(),tn=td>=d.from&&td<=d.to?P(td):td>d.to?101:-1;
  /* 月份與「今天」的位置給 --p（0～100）：靠右放不下的往左對齊，不超出紙寬（board.css 的 .rg-axis） */
  const axis=`<div class="rg-row rg-head"><span></span><span></span><div class="rg-axis">${ms.map(s=>`<span style="--p:${P(s).toFixed(2)}">${pd(s).getMonth()+1}月</span>`).join("")}${tn>=0&&tn<=100?`<span class="rg-now" style="--p:${tn.toFixed(2)}">今天 ${fmt(td).slice(5)}</span>`:""}</div></div>`;
  const body=rows.map(it=>{const s=it.start<it.end?it.start:it.end,e=it.start<it.end?it.end:it.start;
    return `<div class="rg-row"><span class="rg-t">${esc(it.title)}</span><span class="rg-p num">${schedPct(it,d.to)}%</span><div class="rg-bar">${ticksHTML(84,P(s),P(e),tn)}</div></div>`}).join("");
  return `<figure class="rpt-gantt" contenteditable="false">${axis}${body}</figure>`;
}

/* ---------- 報告內容（2026-11-06 改版：封面 → 目錄 → 各章） ----------
   版面參考使用者給的極簡白紙範例：大標題靠左、上下小字資訊、細線分隔、細體大數字當章節號。
   每一章是一張紙（列印時從新的一頁開始）：章首＝細體大數字＋章名＋右上角章節索引（I II III…，目前這章實心）。
   章裡是一個個「圖塊」：文字（段落小工具）、圖片（上傳、調大小與位置）、卡片（分項說明）、看板自動產生的內容（摘要數字、甘特圖、議題逐案）。
   編輯（加章節、加圖塊、上傳圖片、改字）都只用在這一份報告，不存進看板、不上傳（使用者決定）。 */
const RPT_IMG_W=[33,50,66,100];   /* 圖片寬度的快速選項（％，以內文寬為準）；拖曳右下角可在 25～100％ 之間調，每 5％ 一格 */
const rptBlk=(kind,inner,tools="")=>`<div class="rpt-blk" data-blk="${kind}" tabindex="-1"><div class="rpt-bt" contenteditable="false">${tools}<button type="button" data-bmv="-1" aria-label="上移">${ico("prev","solo")}</button><button type="button" data-bmv="1" aria-label="下移">${ico("next","solo")}</button><button type="button" data-bx aria-label="移除這個圖塊">移除</button></div>${inner}</div>`;
const rptTextBlk=(ph="在這裡輸入內容…",html="")=>rptBlk("text",`<div class="rpt-text" contenteditable="true" data-ph="${ph}">${html}</div>`);
const rptCardHTML=()=>`<div class="rpt-card"><button type="button" class="rpt-card-x" contenteditable="false" data-cx aria-label="移除這張卡片">${ico("close","solo")}</button><b contenteditable="true" data-ph="項目名稱"></b><div class="rpt-card-t" contenteditable="true" data-ph="說明"></div></div>`;
const rptCardsBlk=()=>rptBlk("cards",`<div class="rpt-cards" data-cols="2">${rptCardHTML()}${rptCardHTML()}</div><button type="button" class="rpt-card-add" contenteditable="false" data-cadd>＋ 卡片</button>`,
  `<button type="button" data-cols="2" class="on">兩欄</button><button type="button" data-cols="3">三欄</button>`);
const rptImgBlk=src=>rptBlk("img",`<figure class="rpt-img" data-al="c" style="--w:66%"><div class="rpt-img-box"><img src="${src}" alt=""><span class="rpt-img-h" contenteditable="false" aria-hidden="true"></span></div><figcaption contenteditable="true" data-ph="圖說（可留白）"></figcaption></figure>`,
  RPT_IMG_W.map(w=>`<button type="button" data-iw="${w}"${w===66?' class="on"':""}>${w===100?"滿版":w+"%"}</button>`).join("")+`<i class="rpt-bt-sep"></i>`+[["l","靠左"],["c","置中"],["r","靠右"]].map(([k,n])=>`<button type="button" data-ia="${k}"${k==="c"?' class="on"':""}>${n}</button>`).join(""));
const rptAuto=html=>rptBlk("auto",html);   /* 看板自動產生的內容：可以移除、排順序，字可以直接改 */
const rptCh=(k,title,blocks)=>`<section class="rpt-page rpt-sec rpt-ch" data-k="${k}">
    <header class="rpt-ch-h"><span class="rpt-ch-n num" contenteditable="false"></span><h2 contenteditable="true" data-ph="章節名稱">${esc(title)}</h2><span class="rpt-tabs" contenteditable="false" aria-hidden="true"></span>
      <span class="rpt-ct" contenteditable="false"><button type="button" data-cmv="-1" aria-label="章節上移">${ico("prev","solo")}</button><button type="button" data-cmv="1" aria-label="章節下移">${ico("next","solo")}</button><button type="button" data-chx aria-label="移除這一章">移除這章</button></span></header>
    <div class="rpt-blocks">${blocks}</div>
    <div class="rpt-ins" contenteditable="false"><span>在這章加入</span><button type="button" data-ins="text">＋ 文字</button><button type="button" data-ins="img">＋ 圖片</button><button type="button" data-ins="cards">＋ 卡片</button></div></section>`;
function rptHTML(d){
  const dept=CFG.dept.name||state.title;
  const staffJoin=ids=>staffNames(ids).join("、");
  const dot=s=>esc(fmt(s).replaceAll("/","."));
  const cover=`<section class="rpt-page rpt-cover">
    <div class="cv-top"><div class="cv-org"><span class="cv-logo">${suLogoColor("南臺科大學生會")}</span><b contenteditable="true">${esc(dept)}</b></div><span class="cv-date num" contenteditable="true">${dot(today())}</span></div>
    <div class="cv-mid"><p class="cv-k num">WORK REPORT</p><h1 contenteditable="true">工作報告</h1><p class="cv-sub" contenteditable="true">${termCfg().yearLabel?esc(termCfg().yearLabel)+"・":""}${dot(d.from)} – ${dot(d.to)}</p></div>
    <div class="cv-foot"><div class="cv-col"><span contenteditable="true">${esc(meName())}</span><span contenteditable="true" data-ph="職稱（可留白）"></span><span contenteditable="true">南臺科技大學學生會　${esc(dept)}</span></div>
      <div class="cv-col"><span>看板即時動態</span><a class="rpt-live num" href="${esc(boardURL())}" target="_blank" rel="noopener">${esc(boardURL().replace(/^https?:\/\//,""))}</a><span class="num">製表 ${dot(today())}</span></div></div></section>`;
  const toc=`<section class="rpt-page rpt-toc"><header class="toc-h"><span class="num">CONTENTS</span><h2>目錄</h2></header><ol class="toc-list"></ol></section>`;
  const stat=(n,t,s)=>`<div><b class="num">${n}</b><span>${t}</span><small>${s}</small></div>`;
  const sum=rptCh("sum","本期摘要",rptAuto(`<div class="rpt-stats" contenteditable="true">${stat(d.issues.length,"處理議題",`完成 ${d.nDone}・進行中 ${d.nAct}`)}${stat(d.marks,"處理紀錄","期間內的議題註記")}${stat(d.evNew.length,"新增即時回報",`完成 ${d.evDone.length}・併入議題 ${d.evLinked}`)}${stat(d.weeks.length,"每週概述","期間內的週報")}</div>`)+(rptGantt(d)?rptAuto(rptGantt(d)):""));
  const issue=it=>{
    const meta=[hasDates(it)?`期間 ${fmt(it.start)} – ${fmt(it.end)}`:"",it.tags[it.cur]?`目前階段：${it.tags[it.cur]}`:"",staffJoin(it.staff)?`專員：${staffJoin(it.staff)}`:""].filter(Boolean).join("　｜　");
    const mk=sortedMarkers(it).filter(m=>!m.date||d.inP(m.date));
    const evs=state.events.filter(e=>e.issueId===it.id&&(!e.doneAt||d.inP(e.doneAt)||d.inP(e.createdAt)));
    return `<article class="rpt-issue" data-tone="hi"><h3>${esc(it.title)}<span class="rpt-st">${it.doneAt&&it.doneAt<=d.to?`已結案 ${esc(fmt(it.doneAt))}`:`進行中・${hasDates(it)?`時程 ${schedPct(it,d.to)}%`:"未排程"}`}</span></h3>
      ${meta?`<p class="rpt-meta2">${esc(meta)}</p>`:""}<div class="rpt-prog" contenteditable="false"><i style="width:${schedPct(it,d.to)||0}%"></i></div>
      <h4>處理經過</h4>${mk.length?`<ul class="rpt-tl">${mk.map(m=>`<li><span class="rpt-d">${m.date?esc(fmt(m.date).slice(5)):"未標日期"}</span>${m.stage?`【${esc(m.stage)}】`:""}${esc(m.text||"")}</li>`).join("")}</ul>`:`<p class="rpt-none">這段期間沒有處理紀錄</p>`}
      ${it.note?`<h4>目前進度</h4><p>${esc(it.note)}</p>`:""}
      ${evs.length?`<h4>相關即時回報</h4><p>${evs.map(e=>`${esc(evName(e))}（${e.doneAt?esc(fmt(e.doneAt).slice(5))+" 完成":"處理中"}）`).join("、")}</p>`:""}
      ${it.links.length?`<h4>相關連結</h4><p>${it.links.map(l=>`<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join("、")}</p>`:""}</article>`};
  const iss=rptCh("issues","議題處理情形",rptAuto(`<div class="rpt-body" contenteditable="true">${d.issues.map(issue).join("")||'<p class="rpt-none">這段期間沒有處理中的議題</p>'}</div>`));
  return cover+toc+sum+iss+rptCh("free","工作檢討",rptTextBlk("在這裡輸入這段期間的工作檢討…"))+rptCh("free","下期規劃",rptTextBlk("在這裡輸入下一期的規劃…"));
}
/* 空白判斷：列印時空白的圖塊、整章都空白的章不印，目錄與章節號跟著跳過 */
const rptBlank=el=>{
  const k=el.dataset.blk;if(k==="img"||k==="auto")return false;
  if(k==="cards")return ![...el.querySelectorAll(".rpt-card [contenteditable]")].some(c=>c.textContent.trim());
  return ![...el.querySelectorAll('[contenteditable="true"]')].some(c=>c.textContent.trim());   /* 只看能打字的地方，不算工具鈕上的字 */
};
/* 標出空白的圖塊與整章都空白的章（列印時不印；斷頁計算也要先標，打字之後才準） */
function rptMarkBlank(ov){
  const chs=[...ov.querySelectorAll(".rpt-ch")];
  chs.forEach(c=>{c.querySelectorAll(".rpt-blk").forEach(b=>b.classList.toggle("is-blank",rptBlank(b)));c.classList.toggle("is-blank",![...c.querySelectorAll(".rpt-blk")].some(b=>!b.classList.contains("is-blank")))});
  return chs;
}
/* 章節號、目錄、右上角的章節索引一起重算（加章、刪章、排順序、改章名、列印前） */
function rptSync(print){
  const ov=$("#rptOv");if(!ov)return;
  const chs=rptMarkBlank(ov);
  const vis=chs.filter(c=>!print||!c.classList.contains("is-blank")),R=n=>["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][n]||String(n+1);
  vis.forEach((c,i)=>{c.querySelector(".rpt-ch-n").textContent=String(i+1).padStart(2,"0");
    c.querySelector(".rpt-tabs").innerHTML=vis.map((_,j)=>`<i class="${j===i?"on":""}">${R(j)}</i>`).join("")});
  const tl=ov.querySelector(".toc-list");if(tl)tl.innerHTML=vis.map((c,i)=>`<li><span class="toc-n num">${String(i+1).padStart(2,"0")}</span><span class="toc-t"><b>${esc(c.querySelector("h2").textContent.trim()||"（未命名）")}</b><small class="num">${R(i)}</small></span></li>`).join("");
  if(!print)rptPaginateSoon();
}
/* ---------- 斷頁（2026-11-16 R1：斷頁由程式決定，預覽與列印用同一套結果；手機也排真的 A4，整張縮小） ----------
   存成 PDF 時一頁的內文是 182×267mm，內文底下 10mm 畫頁碼（board.css 的 @page：上、左右 14mm，下 6mm）。
   1. 量：紙張加 .rpt-measure（版面照列印；同一個 JS 工作裡加上又拿掉，畫面不會閃），每一章拆成「不能切開的塊」
      （統計、甘特圖、議題、圖片、整組卡片、目錄項目，以及每一段文字、清單項目、小標），從上往下排，放不下的那塊換到下一頁；
      章名不單獨留在頁底；不能切開的塊比一整頁還高時往裡拆；拆不開的（一段比一整頁還長的文字）才從頁底那一行切。
   2. 預覽：紙張一律照 A4 寬（210mm）排，換行跟 PDF 一樣；畫面比紙窄時整張等比例縮小（rptFit）。斷點那一塊前面插一個看不見的
      墊塊（.rpt-sp）把它推到下一張紙的開頭；紙與紙之間一條底色空隙（.rpt-gap），每張紙標「第 N 頁」（.rpt-pg），每章最後一張紙補到滿一張 A4 高。
   3. 列印（rptPrintPrep → rptPaginate(true)）：照列印的樣子（空白章不編號）用同一套規則再算一次，斷點那一塊加 .rpt-brk
      （列印時強制換頁、上邊界歸零），每頁內文最後補 .rpt-fill 到 267mm、接著 .rpt-foot「第 N 頁／共 M 頁」。
      瀏覽器只照這些強制換頁，不再自己找斷點；頁碼一律程式畫（iPhone 的 Safari 不支援 @page 頁碼）。印完排回來時拿掉。
   4. 重算的時機：打字、加減圖塊、圖片載入、視窗大小改變、字型載入後（停 0.22 秒再算）；重算時捲動位置不動。 */
const RPT_AVOID=".rpt-stats,.rpt-gantt,.rpt-issue,.rpt-img,.rpt-cards,.toc-list li,.rpt-ch-h,.toc-h";
let rptPageH=0,rptPgT=0,rptPlan=[];   /* rptPlan：每一頁從哪一塊開始（{sec,el,cut}，第一頁是封面；測試 rp2.js 拿來跟 PDF 比對） */
function rptPaginateSoon(){clearTimeout(rptPgT);rptPgT=setTimeout(()=>rptPaginate(rptPrinting),220)}
addEventListener("resize",()=>{if(rptOpen){rptFit();rptPaginateSoon()}});
const rptShown=el=>getComputedStyle(el).display!=="none";
/* 一般區塊流裡看得見的區塊（行內、絕對定位的工具與標籤不算） */
const rptBlockish=el=>{const s=getComputedStyle(el),d=s.display;return d!=="none"&&d!=="contents"&&!d.startsWith("inline")&&s.position!=="absolute"&&s.position!=="fixed"};
const rptFlow=el=>/^(block|list-item|flow-root)$/.test(getComputedStyle(el).display);   /* 一般的區塊容器才在子元素之間換頁（格線、彈性盒整塊不拆） */
/* 一章拆成要排的塊：{el,keep（章名：跟下一塊同頁）,top,bottom}（top／bottom 相對這張紙、已除掉縮放） */
function rptAtoms(sec,t0,k,H){
  const out=[];
  const walk=el=>{for(const c of el.children){
    if(!rptBlockish(c))continue;
    const r=c.getBoundingClientRect(),kids=[...c.children].some(rptBlockish);
    if(kids&&rptFlow(c)&&(!c.matches(RPT_AVOID)||r.height/k>H+1)){walk(c);continue}   /* 一般的容器往裡拆；不切開的塊比一整頁還高也往裡拆 */
    if(r.height)out.push({el:c,keep:c.matches(".rpt-ch-h,.toc-h"),top:(r.top-t0)/k,bottom:(r.bottom-t0)/k});
  }};
  walk(sec);return out.sort((a,b)=>a.top-b.top);
}
/* 斷點那一塊是父層第一個區塊時，強制換頁改加在父層（一路往上），上邊界才不會留在新的一頁頂端 */
const rptChain=(el,sec)=>{const ch=[el];for(let p=el.parentElement;p&&p!==sec&&[...p.children].find(rptBlockish)===el;p=p.parentElement)ch.push(el=p);return ch};
/* 比一整頁還長、拆不開的一段文字：頁底放不下的第一行從下一頁開始（回傳那一行的上緣；找不到就是頁底 lim） */
function rptLineCut(el,t0,k,ps,lim){
  const lh=parseFloat(getComputedStyle(el).lineHeight);if(!lh||[...el.children].some(rptBlockish))return lim;
  const rg=document.createRange();rg.selectNodeContents(el);
  const tops=[...rg.getClientRects()].map(r=>((r.top+r.bottom)/2-t0)/k).filter(c=>c+lh/2>lim-2).map(c=>c-lh/2);   /* 行高置中：每一行的上下緣 */
  const nx=Math.min(...tops);return nx>ps+1&&nx<lim?nx:lim;
}
const rptMM=mm=>{const t=document.createElement("div");t.style.cssText=`position:absolute;visibility:hidden;height:${mm}mm`;document.body.append(t);const h=t.getBoundingClientRect().height;t.remove();return h};
function rptUnpage(){const p=$("#rptOv .rpt-paper");if(!p)return;
  p.querySelectorAll(".rpt-sp,.rpt-gap,.rpt-pg,.rpt-fill,.rpt-foot").forEach(x=>x.remove());p.querySelectorAll(".rpt-brk").forEach(x=>x.classList.remove("rpt-brk"));
  p.querySelectorAll(":scope>.rpt-page").forEach(s=>{s.classList.remove("is-paged");s.style.removeProperty("--rpt-h")})}
function rptPaginate(print){
  const ov=$("#rptOv"),paper=ov&&ov.querySelector(".rpt-paper");if(!paper)return;
  const sc=ov.querySelector(".rpt-scroll"),keepY=sc?sc.scrollTop:0;
  rptUnpage();const secs=[...paper.querySelectorAll(":scope>.rpt-page")];
  rptMarkBlank(ov);
  if(!rptPageH)rptPageH={H:rptMM(267),A4:rptMM(297),top:rptMM(14)};
  const {H,A4,top:PT}=rptPageH,plan=[];let page=1;
  const K=()=>(paper.getBoundingClientRect().width/paper.offsetWidth)||1;   /* 打開時整層有縮放動畫（pagefx）、手機整張縮小（rptFit）：量到的距離先除掉縮放 */
  const mk=(cls,html,y)=>{const m=document.createElement("div");m.className=cls;m.contentEditable="false";m.setAttribute("aria-hidden","true");m.innerHTML=html;if(y!=null)m.style.top=y.toFixed(1)+"px";return m};
  /* 1. 量 */
  paper.classList.add("rpt-measure");let k=K();
  for(const sec of secs){
    if(!rptShown(sec))continue;
    const brs=[];
    if(!sec.classList.contains("rpt-cover")){
      const t0=sec.getBoundingClientRect().top,A=rptAtoms(sec,t0,k,H);let ps=0,lim=H;
      for(let i=0;i<A.length;i++){const a=A[i];if(a.bottom<=lim+1)continue;
        let j=i;if(j>0&&A[j-1].keep&&A[j-1].top>ps+1)j--;   /* 章名不單獨留在頁底：跟著下一塊換頁 */
        if(A[j].top<=ps+1){const nx=rptLineCut(A[j].el,t0,k,ps,lim);brs.push({el:A[j].el,cut:true,off:nx-A[j].top});ps=nx;lim=ps+H;i=j-1;continue}   /* 比一整頁還高、拆不開：從頁底那一行切 */
        const ch=rptChain(A[j].el,sec),E=ch[ch.length-1];
        brs.push({el:E,chain:ch,atom:A[j].el});ps=(E.getBoundingClientRect().top-t0)/k;lim=ps+H;i=j-1;
      }
    }
    plan.push({sec,start:page,brs});page+=brs.length+1;
  }
  /* 2. 列印用：強制換頁、每頁內文補滿 267mm、頁碼（封面不印頁碼；在拆不開的長段落中間切開的那一頁沒有地方放頁碼） */
  if(print){
    const rel=(el,sec)=>(el.getBoundingClientRect().top-sec.getBoundingClientRect().top)/k;
    plan.forEach(({sec,start,brs})=>{
      brs.forEach(b=>b.chain&&b.chain.forEach(e=>e.classList.add("rpt-brk")));
      if(sec.classList.contains("rpt-cover"))return;
      brs.concat(null).forEach((nb,i)=>{
        const b=brs[i-1],y0=!b?0:rel(b.el,sec)+(b.cut?b.off:0);   /* 這一頁的內文從哪裡開始 */
        if(nb&&nb.cut)return;
        const f=mk("rpt-fill",""),ft=mk("rpt-foot",`第 ${start+i} 頁／共 ${page-1} 頁`);
        if(nb)nb.el.before(f,ft);else sec.append(f,ft);
        f.style.height=Math.max(0,y0+H-rel(f,sec)-1).toFixed(2)+"px";
        ft.style.marginLeft=((sec.getBoundingClientRect().left-f.getBoundingClientRect().left)/k).toFixed(2)+"px";ft.style.width=(sec.getBoundingClientRect().width/k).toFixed(2)+"px";   /* 頁碼照整頁置中（放在有縮排的清單裡也一樣） */
      });
    });
  }
  paper.classList.remove("rpt-measure");
  /* 3. 預覽：排成一張一張的 A4 */
  const GAP=28;k=K();
  plan.forEach(({sec,start,brs})=>{
    sec.append(mk("rpt-pg num",`第 ${start} 頁`,0));sec.classList.add("is-paged");sec.style.setProperty("--rpt-h",A4.toFixed(1)+"px");   /* 排的時候寬度固定（見下面） */
    brs.forEach((b,i)=>{
      const sheetTop=(i+1)*(A4+GAP);
      sec.append(mk("rpt-pg num",`第 ${start+i+1} 頁`,sheetTop));
      if(b.cut)return;   /* 拆不開的長段落：後半段推不到下一張紙，這裡不畫空隙 */
      sec.append(mk("rpt-gap","",sheetTop-GAP));
      const sp=document.createElement("div");sp.className="rpt-sp";sp.contentEditable="false";sp.setAttribute("aria-hidden","true");sp.style.height="1px";b.el.before(sp);   /* 先給 1px：高度 0 時上下段落的邊界會疊在一起，設了高度又不疊，位置會差一截 */
      const now=(b.el.getBoundingClientRect().top-sec.getBoundingClientRect().top)/k,want=sheetTop+PT,d=want-now;
      if(d>=-1)sp.style.height=(1+d).toFixed(1)+"px";else sp.style.marginTop=(d+1).toFixed(1)+"px";   /* 墊塊把這一塊推到下一張紙的開頭（格線的間距算在裡面，多出來就用負的上邊界抵掉） */
    });
    sec.style.setProperty("--rpt-h",((brs.length+1)*(A4+GAP)-GAP).toFixed(1)+"px");   /* 最後一張紙補到滿一張 A4 */
  });
  rptPlan=plan.flatMap(({sec,brs})=>[{sec,el:sec,cut:false},...brs.map(b=>({sec,el:b.atom||b.el,cut:!!b.cut}))]);
  const n=$("#rptPages");if(n)n.textContent=`存成 PDF 共 ${page-1} 頁`;
  rptFit();if(sc)sc.scrollTop=keepY;
}
/* 手機：紙張照 A4 寬排好，畫面比紙窄時整張等比例縮小（board.css 的 .rpt-fit.is-fit）；外框照縮小後的寬高，捲動長度才對 */
function rptFit(){
  const ov=$("#rptOv"),fit=ov&&ov.querySelector(".rpt-fit");if(!fit)return;
  const p=fit.querySelector(".rpt-paper"),k=Math.min(1,ov.querySelector(".rpt-scroll").clientWidth/p.offsetWidth);
  fit.classList.toggle("is-fit",k<1);fit.style.setProperty("--rpt-k",k.toFixed(4));fit.style.setProperty("--rpt-fit-h",(p.offsetHeight*k).toFixed(1)+"px");
}
/* 手機（640px 以下）：紙張縮小後工具太小，點進去的圖塊把工具列搬到畫面底部（.rpt-bt.is-dock），離開那個圖塊再搬回去 */
const rptNarrow=()=>matchMedia("(max-width:640px)").matches;
const rptTools=blk=>blk._bt||blk;   /* 圖塊工具列的按鈕在哪裡找（搬到畫面底部時不在圖塊裡） */
function rptDock(ov){
  let cur=null;
  const undock=()=>{if(!cur)return;const {blk,bt}=cur;cur=null;blk._bt=null;bt.classList.remove("is-dock");blk.prepend(bt)};
  ov._undock=undock;
  ov.addEventListener("focusin",e=>{
    const blk=e.target.closest(".rpt-paper .rpt-blk");
    if(cur&&(cur.blk===blk||cur.bt.contains(e.target)))return;
    undock();if(!blk||!rptNarrow())return;
    const bt=blk.querySelector(":scope>.rpt-bt");if(!bt)return;
    cur={blk,bt};blk._bt=bt;bt._blk=blk;bt.classList.add("is-dock");ov.append(bt);
  });
  ov.addEventListener("focusout",()=>setTimeout(()=>{const a=document.activeElement;if(cur&&!cur.blk.contains(a)&&!cur.bt.contains(a))undock()},0));
  ov.addEventListener("pointerdown",e=>{if(e.target.closest(".rpt-bt.is-dock"))e.preventDefault()});   /* 按工具鈕不搶走焦點（圖塊保持選取） */
}

/* ---------- 預覽視窗 ---------- */
async function reportDialog(){
  const t=today(),pick=[termCfg().termStart,CFG.term.start].find(x=>x&&x<=t)||addDays(t,-90);
  const v=await ask("匯出工作報告",[{name:"from",label:"期間開始",type:"date",value:pick},{name:"to",label:"期間結束",type:"date",value:t}]);
  if(!v)return;let a=v.from||pick,b=v.to||t;if(a>b)[a,b]=[b,a];
  openReport(a,b);
}
function openReport(from,to,doc){
  closeReport(true);rptRange={from,to};rptDoc=doc||null;const L=doc?doc.label:"工作報告";
  document.body.insertAdjacentHTML("beforeend",`<div class="rpt-ov" id="rptOv" role="dialog" aria-modal="true" aria-label="${L}預覽">
    <div class="anim-top rpt-bar" data-fx-keep><div class="anim-title"><span class="anim-k">${doc?doc.k:"REPORT"}</span><b>${L}預覽</b><span class="sub rpt-hint">文字都可以直接點開修改・每一張紙就是 PDF 的一頁・空白的圖塊與章節不會印出來・不會存進看板</span><span class="rpt-pages num" id="rptPages" aria-live="polite"></span></div>
      <div class="anim-ctl"><button type="button" id="rptAdd">＋ 章節</button><button type="button" class="primary" id="rptPrint">${ico("download")}存成 PDF</button><button type="button" id="rptClose" aria-label="關閉${L}">${ico("close")}關閉</button></div></div>
    <div class="rpt-scroll"><div class="rpt-fit"><article class="rpt-paper" spellcheck="false">${doc?doc.html:rptHTML(rptData(from,to))}</article></div></div></div>`);
  const ov=$("#rptOv");rptOpen=true;document.body.classList.add("rpt-open");
  $("#rptClose").onclick=()=>closeReport();Back.layers.report();$("#rptPrint").onclick=rptPrint;$("#rptAdd").onclick=rptAdd;
  rptBind(ov);rptDock(ov);rptFit();rptSync();
  ov._ro=new ResizeObserver(()=>rptFit());ov._ro.observe(ov.querySelector(".rpt-paper"));   /* 內容長高、變矮時，縮小後的外框跟著改高度 */
  /* 實際斷頁：打字、加減圖塊、圖片載入、視窗大小改變、字型載入後都重算（rptPaginate） */
  ov.addEventListener("input",rptPaginateSoon);ov.addEventListener("load",rptPaginateSoon,true);
  document.fonts&&document.fonts.ready.then(rptPaginateSoon);
  /* 貼上時只留純文字，不帶別處的格式 */
  ov.addEventListener("paste",e=>{const t=e.clipboardData&&e.clipboardData.getData("text/plain");if(t==null||!e.target.closest('[contenteditable="true"]'))return;e.preventDefault();document.execCommand("insertText",false,t)});
  rptParaTool(ov);
  PageFx.swap(pageUnder(ov),ov);   /* 換頁動畫：底下那頁往後退、報告從後面浮上來 */
}
function closeReport(instant){
  const ov=$("#rptOv");if(!ov)return;rptOpen=false;Back.closed("report");if(ov._paraOff)ov._paraOff();if(ov._ro)ov._ro.disconnect();
  const done=()=>{ov.remove();if(!$("#rptOv"))document.body.classList.remove("rpt-open")};
  if(instant)return done();
  PageFx.swap(ov,pageUnder(ov),{done});   /* 換頁動畫 */
}
function rptAdd(){
  const p=$("#rptOv .rpt-paper");if(!p)return;
  p.insertAdjacentHTML("beforeend",rptCh("free","",rptTextBlk()));
  const s=p.lastElementChild,h=s.querySelector("h2");rptSync();rptIn(s);
  s.scrollIntoView({behavior:reduceMotion()?"auto":"smooth",block:"start"});h.focus();
}
/* 新加的東西淡入、移除的淡出（只動 transform／opacity） */
const rptIn=el=>{if(!reduceMotion())el.animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"none"}],{duration:MO.base,easing:MO.out})};
const rptOut=(el,then)=>{if(reduceMotion()){el.remove();then&&then();return}el.animate([{opacity:1},{opacity:0,transform:"translateY(-6px) scale(.98)"}],{duration:MO.fast,easing:MO.in}).onfinish=()=>{el.remove();then&&then()}};
/* 位置互換時用 FLIP 滑過去 */
function rptSwap(el,dir){
  const sib=dir<0?el.previousElementSibling:el.nextElementSibling;if(!sib||!sib.matches(el.classList.contains("rpt-ch")?".rpt-ch":".rpt-blk"))return;
  const a=el.getBoundingClientRect().top,b=sib.getBoundingClientRect().top;
  if(dir<0)sib.before(el);else sib.after(el);
  if(reduceMotion())return;
  [[el,a],[sib,b]].forEach(([x,t])=>{const d=t-x.getBoundingClientRect().top;if(d)x.animate([{transform:`translateY(${d}px)`},{transform:"none"}],{duration:MO.slow,easing:MO.out})});
}
/* 上傳圖片：讀成 data URL（只在這份報告裡，不上傳）；太大的先縮到長邊 2000px，列印不會太重 */
function rptPickImg(ch){
  const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.hidden=true;document.body.append(inp);
  inp.onchange=()=>{const f=inp.files&&inp.files[0];inp.remove();if(!f)return;
    const url=URL.createObjectURL(f),im=new Image();
    im.onload=()=>{const k=Math.min(1,2000/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
      c.getContext("2d").drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);
      const src=c.toDataURL(/png|gif|webp/.test(f.type)?"image/png":"image/jpeg",.88);
      ch.querySelector(".rpt-blocks").insertAdjacentHTML("beforeend",rptImgBlk(src));const b=ch.querySelector(".rpt-blocks").lastElementChild;rptIn(b);rptSync();b.focus({preventScroll:true})};
    im.onerror=()=>{URL.revokeObjectURL(url);toast("這個檔案讀不出圖片")};im.src=url};
  inp.click();
}
/* 圖片寬度：拖曳右下角（25～100％，每 5％ 一格，不會超出內文寬；高度另有上限，見 CSS 的 .rpt-img img） */
function rptImgDrag(h,e){
  const fig=h.closest(".rpt-img"),col=fig.parentElement.getBoundingClientRect().width,box=h.parentElement.getBoundingClientRect(),x0=e.clientX,w0=box.width,al=fig.dataset.al;
  const k=al==="c"?2:al==="r"?-1:1;   /* 置中時兩邊一起長，拖一下要算兩倍 */
  const mv=ev=>{const w=Math.max(25,Math.min(100,Math.round((w0+(ev.clientX-x0)*k)/col*20)*5));fig.style.setProperty("--w",w+"%");rptTools(fig.closest(".rpt-blk")).querySelectorAll("[data-iw]").forEach(b=>b.classList.toggle("on",+b.dataset.iw===w))};
  const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up);removeEventListener("pointercancel",up);fig.classList.remove("sizing")};
  fig.classList.add("sizing");addEventListener("pointermove",mv);addEventListener("pointerup",up);addEventListener("pointercancel",up);e.preventDefault();
}
function rptBind(ov){
  ov.addEventListener("click",e=>{
    const t=e.target,ch=t.closest(".rpt-ch"),bt=t.closest(".rpt-bt"),blk=t.closest(".rpt-blk")||(bt&&bt._blk);   /* 手機上工具列可能搬到畫面底部（rptDock） */
    const ins=t.closest("[data-ins]");if(ins&&ch){const k=ins.dataset.ins;if(k==="img"){rptPickImg(ch);return}
      ch.querySelector(".rpt-blocks").insertAdjacentHTML("beforeend",k==="cards"?rptCardsBlk():rptTextBlk());const b=ch.querySelector(".rpt-blocks").lastElementChild;rptIn(b);rptSync();
      const f=b.querySelector('[contenteditable="true"]');if(f)f.focus();return}
    if(t.closest("[data-bx]")&&blk){ov._undock();rptOut(blk,rptSync);return}
    const bm=t.closest("[data-bmv]");if(bm&&blk){rptSwap(blk,+bm.dataset.bmv);return}
    if(t.closest("[data-chx]")&&ch){ov._undock();rptOut(ch,rptSync);return}
    const cm=t.closest("[data-cmv]");if(cm&&ch){rptSwap(ch,+cm.dataset.cmv);rptSync();return}
    const iw=t.closest("[data-iw]");if(iw&&blk){blk.querySelector(".rpt-img").style.setProperty("--w",iw.dataset.iw+"%");rptTools(blk).querySelectorAll("[data-iw]").forEach(b=>b.classList.toggle("on",b===iw));return}
    const ia=t.closest("[data-ia]");if(ia&&blk){blk.querySelector(".rpt-img").dataset.al=ia.dataset.ia;rptTools(blk).querySelectorAll("[data-ia]").forEach(b=>b.classList.toggle("on",b===ia));return}
    const co=t.closest("[data-cols]");if(co&&blk&&co.tagName==="BUTTON"){blk.querySelector(".rpt-cards").dataset.cols=co.dataset.cols;rptTools(blk).querySelectorAll("button[data-cols]").forEach(b=>b.classList.toggle("on",b===co));return}
    if(t.closest("[data-cadd]")&&blk){const g=blk.querySelector(".rpt-cards");g.insertAdjacentHTML("beforeend",rptCardHTML());const c=g.lastElementChild;rptIn(c);c.querySelector("b").focus();return}
    const cx=t.closest("[data-cx]");if(cx){const c=cx.closest(".rpt-card");if(c.parentElement.children.length>1)rptOut(c);return}
  });
  ov.addEventListener("pointerdown",e=>{const h=e.target.closest(".rpt-img-h");if(h)rptImgDrag(h,e)});
  ov.addEventListener("input",e=>{if(e.target.closest&&e.target.closest(".rpt-ch-h h2"))rptSync()});
}
/* ---------- 段落小工具（自訂區塊：工作檢討、下期規劃、新區塊） ----------
   游標在自訂區塊裡時，那一段左邊（手機在區塊下方）浮出三個小鈕：大段（（一）自動編號）、小段（1. 自動編號）、內文。
   游標在這段最後面＝在下面換一個新段落；在段落中間或這段是空的＝把這段改成那一層。編號由 CSS counter 自動排。
   縮排：每一段的左邊對齊它所屬那一層標題的「文字起點」（編號凸出在左邊），不是整份文件的最左邊。
   由 indent() 依前面最近的標題標 data-in：a＝大段之下、b＝小段之下（前面沒有大段）、ab＝大段裡的小段之下；寬度在 CSS 的 --rw1／--rw2。 */
const RPT_LV={h1:{tag:"H3",cls:"rpt-h1",name:"大段"},h2:{tag:"H4",cls:"rpt-h2",name:"小段"},p:{tag:"P",cls:"",name:"內文"}};
function rptParaTool(ov){
  const pt=document.createElement("div");pt.className="rpt-pt";pt.contentEditable="false";pt.hidden=true;
  pt.innerHTML=Object.entries(RPT_LV).map(([k,v])=>`<button type="button" data-lv="${k}">${v.name}</button>`).join("");
  /* 把區塊裡的純文字、瀏覽器自己產生的 <div>／<br> 整理成一段一個 <p> */
  const tidy=box=>{
    if(!box.textContent.trim()&&!box.querySelector("h3,h4")){box.innerHTML="";return}
    [...box.childNodes].forEach(n=>{
      if(n.nodeType===3){if(!n.textContent.trim()){n.remove();return}const q=document.createElement("p");n.replaceWith(q);q.append(n)}
      else if((n.nodeName==="DIV"&&n.contentEditable!=="false")||n.nodeName==="BR"){   /* 斷頁的墊塊（.rpt-sp）不是內容，不要變成段落 */const q=document.createElement("p");if(n.nodeName==="DIV")q.append(...n.childNodes);n.replaceWith(q);if(!q.firstChild)q.append(document.createElement("br"))}
    });
    indent(box);
  };
  const indent=box=>{let h1=false,h2=false;
    [...box.children].forEach(n=>{
      if(n.classList.contains("rpt-h1")){h1=true;h2=false;n.removeAttribute("data-in");return}
      if(n.classList.contains("rpt-h2"))h2=true;
      const v=(h1?"a":"")+(h2?"b":"");if(v)n.dataset.in=v;else n.removeAttribute("data-in");
    })};
  const blockOf=(box,node)=>{while(node&&node.parentNode!==box)node=node.parentNode;return node&&node.nodeType===1?node:null};
  const caretIn=()=>{const sel=getSelection();if(!sel.rangeCount)return null;const n=sel.anchorNode,box=n&&(n.nodeType===1?n:n.parentNode).closest(".rpt-text");return box&&ov.contains(box)&&(!rptNarrow()||box.contains(document.activeElement))?{box,sel}:null};   /* 手機：小工具在畫面底部，離開文字（失去焦點）就收起來 */
  const place=()=>{
    const c=caretIn();if(!c){pt.hidden=true;return}
    const sec=c.box.closest(".rpt-sec"),blk=blockOf(c.box,c.sel.anchorNode)||c.box,host=rptNarrow()?ov:sec;   /* 手機：紙張縮小了，小工具放在畫面底部（不跟著縮小） */
    if(pt.parentNode!==host)host.append(pt);
    const p=sec.closest(".rpt-paper"),k=(p.getBoundingClientRect().width/p.offsetWidth)||1;
    pt.hidden=false;pt.style.setProperty("--y",((blk.getBoundingClientRect().top-sec.getBoundingClientRect().top)/k)+"px");
    const cur=blk===c.box?"p":(blk.classList.contains("rpt-h1")?"h1":blk.classList.contains("rpt-h2")?"h2":"p");
    pt.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.lv===cur));
  };
  const make=lv=>{const v=RPT_LV[lv],el=document.createElement(v.tag);if(v.cls)el.className=v.cls;return el};
  const caretTo=(el,atEnd)=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(!atEnd);const sel=getSelection();sel.removeAllRanges();sel.addRange(r)};
  /* 按鈕不搶走游標 */
  pt.addEventListener("pointerdown",e=>e.preventDefault());
  pt.addEventListener("click",e=>{
    const b=e.target.closest("[data-lv]");if(!b)return;const c=caretIn();if(!c)return;
    const {box,sel}=c;tidy(box);
    let blk=blockOf(box,sel.anchorNode);
    if(!blk){blk=document.createElement("p");blk.append(document.createElement("br"));box.append(blk)}
    const r=sel.getRangeAt(0),tail=document.createRange();tail.selectNodeContents(blk);tail.setStart(r.endContainer,r.endOffset);
    const atEnd=!tail.toString().length,empty=!blk.textContent.trim(),lv=b.dataset.lv,el=make(lv);
    if(empty||!atEnd){el.append(...blk.childNodes);if(!el.firstChild)el.append(document.createElement("br"));blk.replaceWith(el);caretTo(el,true)}   /* 改這段的層級 */
    else{el.append(document.createElement("br"));blk.after(el);caretTo(el,false)}                                          /* 換新段落 */
    indent(box);
    if(!reduceMotion())el.animate([{opacity:0,transform:"translateY(-3px)"},{opacity:1,transform:"none"}],{duration:220,easing:"cubic-bezier(.2,.9,.25,1)"});
    b.animate([{transform:"scale(.92)"},{transform:"none"}],{duration:200,easing:"cubic-bezier(.3,1.6,.5,1)"});
    place();
  });
  /* 區塊裡按 Enter 一律產生 <p>；整段刪光時清空，讓提示字回來、列印時跳過 */
  ov.addEventListener("focusin",e=>{if(e.target.closest(".rpt-text")){try{document.execCommand("defaultParagraphSeparator",false,"p")}catch(_){}tidy(e.target.closest(".rpt-text"))}});
  ov.addEventListener("input",e=>{const box=e.target.closest&&e.target.closest(".rpt-text");if(!box)return;if(!box.textContent.trim()&&!box.querySelector("h3,h4"))box.innerHTML="";else indent(box)});
  ov.addEventListener("focusout",e=>{const box=e.target.closest(".rpt-text");if(box)tidy(box);setTimeout(()=>{if(!caretIn())pt.hidden=true},0)});
  document.addEventListener("selectionchange",place);
  ov.querySelector(".rpt-scroll").addEventListener("scroll",place,{passive:true});
  ov._paraOff=()=>document.removeEventListener("selectionchange",place);
}
/* 列印：只印報告本身；PDF 的預設檔名用報告名稱 */
let rptPrinting=false;
/* 列印前：空白的章不印，章節號、目錄、索引照要印的重排；斷點用同一套規則照這個樣子再算一次，加上強制換頁與頁碼（rptPaginate(true)） */
function rptPrintPrep(){
  if(rptPrinting||!rptOpen)return;rptPrinting=true;
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  rptSync(true);clearTimeout(rptPgT);rptPaginate(true);
  addEventListener("afterprint",rptAfterPrint,{once:true});
}
/* 印完排回來。iPhone 等瀏覽器的 afterprint 可能在真的印出來之前就到：等使用者回到畫面上操作（點、按鍵、捲動）才排回來 */
function rptAfterPrint(){
  const ev=["pointerdown","keydown","wheel"],back=()=>{ev.forEach(t=>removeEventListener(t,back,true));rptPrinting=false;if(rptOpen){rptSync();clearTimeout(rptPgT);rptPaginate()}};
  ev.forEach(t=>addEventListener(t,back,true));
}
addEventListener("beforeprint",rptPrintPrep);   /* 用瀏覽器選單（Ctrl+P）列印也一樣 */
function rptPrint(){
  const t=document.title,r=rptRange||{from:"",to:""};
  document.title=rptDoc?rptDoc.file:`${CFG.dept.name||""}工作報告_${r.from.replaceAll("-","")}-${r.to.replaceAll("-","")}`;
  rptPrintPrep();
  const back=()=>{document.title=t;removeEventListener("afterprint",back)};addEventListener("afterprint",back);
  try{window.print()}catch(_){dispatchEvent(new Event("afterprint"));toast("這個環境不能列印：請用瀏覽器打開網站再匯出")}
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&rptOpen&&!$("#dlg").open)closeReport()});
/* 報告裡「查看看板即時動態」的網址：目前這個看板（含 ?d=部門），不帶 # 後面的畫面狀態 */
function boardURL(){return location.href.split("#")[0]}
