/* 畫面骨架：核心程式的 HTML 結構。部門資訊（logo、名稱）由 dept/ 提供，這裡不寫死任何部門。 */
const SHELL_IDS=["pager","importFile","dlg","toast","splash"];
const SHELL_HTML=`<div class="pager" id="pager">
  <!-- main page -->
  <div class="page page-main" id="pageMain">
    <div class="wrap">
      <!-- 部門標題列（DESIGN-next 第六節「部門內」）：首頁鍵、部門標誌、英文小標與部門名、（沒有權限）唯讀標籤、（可編輯的單位）唯讀檢視的眼睛鈕、通知鈕。
           換分頁、進出設定與通知都是同一個節點（data-fx-keep，不參加進場動畫）；顯示哪些鈕由 views.js 的 renderHero 決定 -->
      <div class="dtop" id="dTop">   <!-- 固定在畫面最上面：標題列（.dtop）與搜尋列（.dsrow）；往下捲內容從下面滑過（board.css「部門標題列」段） -->
      <header class="dhead" data-fx-keep>
        <a class="dh-btn dh-home" href="home.html" aria-label="首頁"></a>   <!-- 在部門主頁是首頁鍵；進到更深的頁面（設定、通知、卡片詳情…）自動變成上一頁（views.js 的 homeSync） -->
        <span class="dh-logo" aria-hidden="true"></span>
        <div class="dh-name"><span class="dh-en" id="dhEn"></span><b id="dhName"></b></div>
        <span class="dh-ro" id="dhRo" hidden>唯讀</span>
        <span class="dh-st"><span class="sr-only" id="saveInfo" role="status"></span></span>
        <span class="dh-sp"></span>
        <button type="button" class="dh-btn dh-eye" id="peekBtn" aria-pressed="false" aria-label="用唯讀檢視看這個單位" hidden></button>
        <button type="button" class="dh-btn noti-btn" id="notiBtn" aria-label="通知" aria-pressed="false" hidden><span class="noti-n num" hidden></span></button>
      </header>
      </div>
      <div class="dsrow" id="dsRow">
      <!-- 搜尋列（每個分頁；search.js）：有輸入時內容換成分區的結果清單（#boardRes），點結果跳到那一項並打開 -->
      <label class="dsearch" id="dSearch"><svg class="ds-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="boardQ" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="搜尋" aria-controls="boardRes"><button type="button" class="ds-x" aria-label="清除搜尋" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button></label>
      <!-- 通知與行事曆頁的搜尋列（notify.js；「搜尋事件」）：跟上面那條同一個元件、同一個位置，只在通知頁顯示（search.js 的 hsBar 切換） -->
      <label class="dsearch" id="dSearchCal" hidden><svg class="ds-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="calBarQ" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="搜尋事件" aria-label="搜尋事件" aria-controls="calHRes"><button type="button" class="ds-x" id="calBarX" aria-label="清除搜尋" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button></label>
      </div>
      <!-- 手機只有這一層捲動（board.css「手機固定頂部」）：標題列與搜尋列在它上面不動，只有下面的資訊自己捲、拖、回彈；電腦版這兩層是 display:contents，等於沒有 -->
      <div class="wrap-sc" id="wrapSc"><div class="wrap-in" id="wrapIn">
      <div class="dres" id="boardRes" role="region" aria-label="搜尋結果" data-flip="sres" hidden></div>

      <!-- 會長室：會長預約（06，booking.js）：同學看「可預約時段」與「我的預約」，會長室管理員與總管理員看待審申請、已核准的預約、開放時段；所有人都看得到這張卡（沒登入、還沒啟用也寫明原因） -->
      <section class="panel bk-panel" id="bkPanel" aria-labelledby="bkH" hidden>
        <div class="panel-head"><h2 class="sec-h" id="bkH" data-en="BOOKING">跟會長預約</h2></div>
        <div id="bkBody"></div>
      </section>
      <!-- 會長室：文件連結（follow.js 的 renderDocs）。會長自己新增的超連結按鈕，點了用新分頁打開 -->
      <section class="panel docs-panel" id="docsPanel" data-edbox="s:docs" aria-labelledby="dcH" hidden>
        <div class="panel-head"><h2 class="sec-h" id="dcH" data-en="DOCS">文件</h2><button type="button" class="icon card-edit-btn" data-edit="s:docs">編輯</button></div>
        <div class="docs" id="docsList" data-flip></div>
        <button class="ghost edit-only add-row" id="addDoc">+ 新增文件</button>
      </section>
      <!-- 會長室：秘書處會議編輯的開關（2026-11-06 使用者：不用這麼大，小小一個開關） -->
      <section class="panel grant-panel" id="grantPanel" hidden>
        <div class="grant-row"><span class="grant-l" id="grH">秘書處會議編輯</span><button type="button" class="sw" id="grantSw" role="switch" aria-checked="false" aria-labelledby="grH"><i aria-hidden="true"></i></button><p class="sub grant-st" id="grantSt"></p></div>
      </section>
      <!-- 秘書處：點名（07，attendance.js）：名冊、場次、逐人點名；只有秘書處編輯者以上與總管理員看得到 -->
      <section class="panel at-panel" id="attPanel" aria-labelledby="atH" hidden>
        <div class="panel-head"><h2 class="sec-h" id="atH" data-en="ATTENDANCE">點名</h2><span class="at-tools"><button type="button" class="icon" data-at="roster" disabled>名冊</button><button type="button" class="icon" data-at="copy" disabled>複製結果</button><button type="button" class="icon" data-at="addsess" disabled>+ 場次</button></span></div>
        <div id="attBody"></div>
      </section>
      <section class="panel act-panel" id="actPanel" aria-labelledby="acH" hidden>
        <div class="panel-head"><h2 class="sec-h" id="acH" data-en="ACTIVITY">各部門編輯量</h2><button type="button" class="icon" id="actRefresh">重新整理</button></div>
        <p class="sub ac-info" id="actInfo"></p>
        <div class="ac-chart" id="actChart"></div>
        <div class="ac-legend" id="actLegend"></div>
      </section>
      <section class="panel follow-panel" id="followPanel" data-edbox="s:follow" aria-labelledby="fwH" hidden>
        <div class="panel-head"><h2 class="sec-h" id="fwH" data-en="FOLLOW">追蹤</h2><button type="button" class="icon card-edit-btn" data-edit="s:follow">編輯</button></div>
        <div class="follows" id="follows" data-flip></div>
        <button class="ghost edit-only add-row" id="addFollow">+ 追蹤項目</button>
      </section>
      <!-- 秘書處：會議資料入口（2026-11-23：「會議」分頁只有「點名」「會議資料」兩個區塊；點進會議資料才打開自己一個頁面 #agOv，文件預覽＋左右工具＋會議報告事項＋各部門週報都整合在那一頁，meeting.js 的 renderAgenda） -->
      <section class="panel follow-panel meet-panel ag-entry" id="agEntry" aria-labelledby="agH" hidden>
        <div class="panel-head"><h2 class="sec-h" id="agH" data-en="AGENDA">會議資料</h2><span class="ag-open-t">開啟文件 ›</span></div>
        <div class="ag-peek" id="agPeek" role="button" tabindex="0" aria-label="開啟行政會議資料"></div>
      </section>
      <div class="ag-ov" id="agOv" role="dialog" aria-modal="true" aria-label="行政會議資料" hidden>
        <div class="anim-top" data-fx-keep><div class="anim-title"><b class="sec-h" data-en="AGENDA">行政會議資料</b></div><div class="anim-ctl"><button type="button" class="icon" id="agCopy">複製文字</button><button type="button" class="icon" id="agDrive" hidden>存到雲端</button><button type="button" class="primary" id="agGo">儲存</button><button type="button" id="agClose" aria-label="關閉行政會議資料">關閉</button></div></div>
        <div class="ag-scroll">
          <div class="ag-wrap">
            <aside class="ag-tools ag-left" id="agLeft" aria-label="會議與部門報告"></aside>
            <div class="ag-center"><article class="md-doc ag-paper" id="agDoc" spellcheck="false"></article></div>
            <aside class="ag-right" id="agRight" data-focus="card" aria-label="文字備註與卡片編輯">
              <section class="ag-rb ag-note" data-rb="note"><h3 class="ag-rh"><span>文字備註</span><span class="ag-rd" id="agNoteD"></span></h3><div class="ag-rbi" id="agNoteBody"></div></section>
              <section class="ag-rb ag-cardbox" data-rb="card"><h3 class="ag-rh"><span>卡片編輯</span><span class="ag-rd" id="agCardD"></span></h3><div class="ag-rbi" id="agCardBody"></div></section>
            </aside>
          </div>
          <p class="sub ag-st" id="agSt"></p>
          <div class="ag-more" id="agMore"></div>
        </div>
      </div>
      <section class="panel follow-panel meet-panel wk-panel" id="wkPanel" aria-labelledby="wkH" hidden>
        <div class="panel-head"><h2 class="sec-h" id="wkH" data-en="WEEKLY">各部門週報</h2><button type="button" class="icon" data-mtrefresh>擷取最新</button></div>
        <div class="wk-depts" id="wkDepts" role="tablist" aria-label="部門"></div>
        <div class="wk-body" id="wkBody" data-flow></div>
      </section>
      <!-- 秘書處：會議報告事項（2026-11-06 起「會議報告事項」與「會議編輯」合成這一張，meeting.js 的 renderMeet）。
           上面一排部門（有報告事項的，後面是件數），一次看一個部門，下面上一個／下一個部門；會長室今天開放時這張有「編輯」，逐部門改；
           最下面「匯出會議紀錄」：照寫回各部門時記下的修改，產生會議紀錄（report.js 的預覽，存成 PDF） -->
      <section class="panel follow-panel meet-panel meet-edit" id="meetEdPanel" data-edbox="s:meetedit" aria-labelledby="meH" hidden>
        <div class="panel-head"><h2 class="sec-h" id="meH" data-en="MEETING">會議報告事項</h2><button type="button" class="icon" data-mtrefresh>重新整理</button><button type="button" class="icon card-edit-btn" data-edit="s:meetedit" hidden>編輯</button></div>
        <p class="sub grant-st" id="meetEdSt"></p>
        <div class="wk-depts mt-pick" id="meetPick" role="tablist" aria-label="部門"></div>
        <div class="mt-depts" id="meetEdList" data-flip></div>
        <div class="mt-step" id="meetStep"></div>
        <div class="mt-foot"><button type="button" class="icon" id="minutesBtn">匯出會議紀錄</button><span class="sub" id="minutesInfo"></span></div>
      </section>
      <div class="layout">
        <div class="sgroup" data-sec="live">
          <!-- 會議結論（proposals.js）：秘書處送來、還沒處理的提案；沒有提案或不是該部門編輯者就整張不顯示 -->
          <section class="panel mp-panel" id="mpPanel" aria-labelledby="mpH" hidden>
            <div class="panel-head"><h2 class="sec-h" id="mpH" data-en="MEETING">會議結論</h2><span class="sub" id="mpCnt"></span></div>
            <div id="mpList"></div>
          </section>
          <section class="panel" id="livePanel" aria-labelledby="evH">
            <div class="panel-head"><h2 class="sec-h" id="evH" data-en="LIVE">即時回報</h2></div>
            <div class="md" id="liveMD"><div class="ev-list" id="events" data-flip></div><div class="lc-pane" id="evDetail" hidden></div></div>
          </section>
        </div>

        <div class="sgroup" data-sec="progress">
          <!-- 進度：甘特圖與個別議題合成一張卡片。預設看甘特圖；點議題列換成該議題的詳情，按返回回到甘特圖（views.js 的 progShow） -->
          <section class="panel" id="progPanel" aria-labelledby="ganttH">
            <!-- 標題列（DESIGN-next 第八節、模擬頁 TIMELINE；ui-09）：英文小標＋「進度」，右邊全部／上學期／下學期、實心「+ 議題」、甘特圖時間軸的「編輯」；
                 分段切換與「+ 議題」只在甘特圖那一頁（議題詳情時藏起來，board.css「進度頁標題列」） -->
            <div class="panel-head pg-head"><h2 class="sec-h" id="ganttH" data-en="${ISS==="專案"?"PROJECTS":"TIMELINE"}">${ISS==="專案"?"專案":"進度"}</h2>
              <div class="g-term lseg" id="gTerm" role="tablist" aria-label="甘特圖範圍"><span class="lseg-lens" aria-hidden="true"></span><button type="button" role="tab" data-k="all" aria-selected="true">全部</button><button type="button" role="tab" data-k="up" aria-selected="false">上學期</button><button type="button" role="tab" data-k="down" aria-selected="false">下學期</button></div>
              <button type="button" class="pg-add auth-only" id="addIssue"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>${ISS}</button>
              <button type="button" class="icon card-edit-btn" id="ganttEdBtn" data-edit="s:gantt" aria-label="編輯甘特圖時間軸">編輯</button></div>
            <div class="pv-page" id="pvGantt" data-edbox="s:gantt">
            <div class="legend" aria-label="圖例"><span><i class="lg-now" aria-hidden="true"></i>今天</span><span><i class="lg-sl lg-a" aria-hidden="true"></i>已過時程</span><span><i class="lg-sl lg-b" aria-hidden="true"></i>剩餘時程</span></div>
            <div class="range">時間軸 <input type="month" id="rStart" aria-label="起始月份"> 到 <input type="month" id="rEnd" aria-label="結束月份"> <button class="icon" id="autoRange">依議題自動調整</button></div>
            <div class="gantt" id="gantt" data-flip></div>
            </div>
            <div class="pv-page" id="pvDetail" hidden>
              <div id="cardDetail"></div>
            </div>
          </section>
        </div>

        <div class="sgroup" data-sec="done">
          <aside class="panel" id="donePanel" aria-labelledby="doneH">
            <div class="panel-head"><h2 class="sec-h" id="doneH" data-en="DONE">完成紀錄<span class="count" id="doneCount">0</span></h2></div>
            <div class="wks-rail" id="doneRail" data-own-gesture hidden></div>
            <div class="md" id="doneMD"><div class="ev-list" id="doneList" data-flip></div><div class="lc-pane" id="doneDetail" hidden></div></div>
          </aside>
        </div>
        <!-- 通知與行事曆（DESIGN-next 第九節）：標題列的通知鈕進到這一頁（不是工具列的分頁，鏡片留在原分頁）；內容由 notify.js 的 renderNoti 畫 -->
        <div class="sgroup sg-noti" data-sec="noti" id="notiPage" role="region" aria-label="通知與行事曆"></div>
      </div>
      </div></div>
    </div>
  </div>

</div>


<input type="file" id="importFile" accept=".html,.htm,.json" hidden>
<dialog id="dlg"><form method="dialog" id="dlgForm"></form></dialog>
<div class="toast" id="toast" role="status"></div>
`;
/* 文件（工作報告）上的學生會 logo：一律原檔彩色、不跟深淺色（2026-11-06 使用者：logo 在文件上都用彩色）。
   不需要切割線（兩塊顏色本來就不同）。 */
function suLogoColor(label){
  const [VX,VY,VW,VH]=SU_LOGO.box,[,,,,[[cy,dy],[cb,db]]]=SU_LOGO.emb;
  return `<svg class="su-logo-c" xmlns="http://www.w3.org/2000/svg" viewBox="${VX} ${VY} ${VW} ${VH}" role="img" aria-label="${label}"><path fill="${cy}" d="${dy}"/><path fill="${cb}" d="${db}"/>${SU_LOGO.g.map(g=>`<path fill="${g[4]}" d="${g[5]}"/>`).join("")}</svg>`;
}
(function mountShell(){
  if(!document.getElementById("pager"))document.body.insertAdjacentHTML("afterbegin",SHELL_HTML);
  mountSplash();   /* 開頁的學生會進場畫面（core/js/splash.js，總覽頁也用同一份） */
  /* 標題列的部門名與英文小標（設定檔與 DEPT_EN 的文字，用 textContent 放） */
  const nm=document.getElementById("dhName"),en=document.getElementById("dhEn");
  if(nm)nm.textContent=CFG.dept.name||"";
  if(en){en.textContent=DEPT_EN[CFG.deptId]||"";en.hidden=!en.textContent}
  /* 部門標誌放進頁面（不用 <img>）：深色時標誌裡的藍改成白、秘書處的白色零件跟著標題列的底色，都要 CSS 吃得到（board.css「部門標誌」段） */
  const lg=document.querySelector(".dhead .dh-logo");if(lg)PageFx.svg(deptLogo(CFG.deptId)).then(s=>{if(s&&!lg.firstChild)lg.append(s)});
  /* 固定區的高度（黏在下面的卡片、捲動定位、卡片高度用）：--dhd-h＝標題列，--dtop-h＝標題列＋搜尋列；高度＝區塊高＋黏住時的 top（負值，往上多出的內距捲到畫面外） */
  const dt=document.getElementById("dTop"),dr=document.getElementById("dsRow");
  if(dt&&dr){const sync=()=>{const h=Math.max(0,Math.round(dt.offsetHeight+(parseFloat(getComputedStyle(dt).top)||0))),s=document.documentElement.style;
      s.setProperty("--dhd-h",h+"px");s.setProperty("--dtop-h",h+dr.offsetHeight+"px")};
    sync();if(window.ResizeObserver){const ro=new ResizeObserver(sync);ro.observe(dt);ro.observe(dr)}addEventListener("resize",sync)}
  const q=document.getElementById("boardQ");if(q)q.setAttribute("aria-label","搜尋"+(CFG.dept.name||""));
  /* 部門主色 → CSS 變數（只覆寫設定檔有給的值）。完成綠（ok）、螢光綠（neon、okDot）2026-11-17 起跟著主題（core/theme.css 的 --ok），
     設定檔的值不再套用，不然會蓋掉主題（:root 的同權重規則寫在後面）；紅色只剩白紙報告用的 --accent-light（accentDark 沒有樣式用到，不再寫入） */
  const c=CFG.colors||{},map={accentLight:"--accent-light"};
  const vars=Object.keys(map).filter(k=>c[k]).map(k=>`${map[k]}:${c[k]}`).join(";");
  if(vars&&!document.getElementById("dept-theme")){const st=document.createElement("style");st.id="dept-theme";st.textContent=`:root{${vars}}`;document.head.append(st)}
  /* 部門專用的分頁（CFG.ext）與完成紀錄併進即時回報（CFG.mergeDone），見 dept/config.js。
     會長室、秘書處的面板原本疊在三個區塊上面（2026-11-06 使用者：太臃腫），搬進自己的分頁 */
  const lay=document.querySelector(".layout");
  if(lay&&CFG.mergeDone){const g=lay.querySelector('.sgroup[data-sec="done"]'),l=lay.querySelector('.sgroup[data-sec="live"]');if(g&&l){while(g.firstChild)l.append(g.firstChild);g.remove()}}
  if(lay&&CFG.ext&&!lay.querySelector('.sgroup[data-sec="ext"]')){lay.insertAdjacentHTML("beforeend",'<div class="sgroup sgroup-ext" data-sec="ext"></div>');const x=lay.lastElementChild;
    ["#bkPanel","#docsPanel","#grantPanel","#followPanel","#actPanel"].forEach(q=>{const p=document.querySelector(q);if(p)x.append(p)});
    const att=document.getElementById("attPanel"),ent=document.getElementById("agEntry");
    if(att||ent){x.insertAdjacentHTML("beforeend",'<div class="ag-cols"></div>');const c=x.lastElementChild;[att,ent].forEach(p=>{if(p)c.append(p)})}   /* 「會議」分頁：點名、會議資料左右兩區（手機上下排） */
    const ov=document.getElementById("agOv"),more=document.getElementById("agMore");   /* 會議資料自己一頁：蓋在整個畫面上（不在分頁裡）；會議報告事項（會長室開放當天改部門卡片）與各部門週報放在文件下面 */
    if(ov){document.body.append(ov);[["#meetEdPanel",more],["#wkPanel",more]].forEach(([q,to])=>{const p=document.querySelector(q);if(p&&to)to.append(p)})}}
  /* 關閉的區塊 */
  Object.entries(CFG.sections).forEach(([k,on])=>document.body.classList.toggle("no-"+k,!on));
})();
