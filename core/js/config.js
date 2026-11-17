/* 核心｜讀取部門設定檔（window.BOARD_CONFIG），沒給的欄位用通用預設值。核心程式只透過 CFG 取得部門資訊。 */
const CFG=(()=>{
  const D={
    boardId:"board-main",
    title:"工作看板",
    brand:"",
    dept:{name:"",org:""},
    stageTags:["進行中","完成"],
    colors:{},
    sections:{live:true,timeline:true,cards:true,done:true,weekly:true,simple:true},
    term:{label:"",start:"",end:""},
    data:{owner:"",repo:"",branch:"main",path:"data.json",page:"index.html"},
    notify:{url:""},
    week:{cutoff:2},
    deptId:"",logo:true,follow:false,meeting:false,grant:false,ext:"",extIcon:"",mergeDone:false,source:"github",firebase:null,
  };
  const u=window.BOARD_CONFIG||{},o={...D,...u};
  ["dept","colors","sections","term","data","notify","week"].forEach(k=>o[k]={...D[k],...(u[k]||{})});
  if(!Array.isArray(o.stageTags))o.stageTags=D.stageTags;
  return Object.freeze(o);
})();
const secOn=k=>k==="progress"?(CFG.sections.timeline||CFG.sections.cards):k==="ext"?!!CFG.ext:CFG.sections[k]!==false;
/* 底部工具列的分頁（區塊）：完成紀錄併進即時回報的部門（mergeDone）不另外算一區；secOf＝某一區實際在哪個分頁裡 */
const secTab=k=>secOn(k)&&!(k==="done"&&CFG.mergeDone);
const secOf=k=>k==="done"&&CFG.mergeDone?"live":k;
/* 部門英文名（DESIGN-next 第四節）：標題列名稱上面、主頁色塊上的英文小標（ui-07 從 shell.js 搬來，主頁也用）。用部門代號（dept/config.js 的 id）對照，不改設定檔；
   表上沒有的部門（例如測試用的水果部）不放英文小標 */
const DEPT_EN={president:"PRESIDENT",secretariat:"SECRETARIAT",rights:"STUDENT RIGHTS",marketing:"MARKETING",finance:"FINANCE",events:"EVENTS",affairs:"CLUB AFFAIRS",pr:"PUBLIC RELATIONS",works:"FACILITIES"};
/* 部門標誌（DESIGN-next 第五節「部門標誌」）：九個部門各一個 SVG（dept/icons/dept-代號.svg；藍 #0a5baa、黃 #f0bc23 寫在檔案裡，不跟主題變）。
   部門標題列（shell.js）用 <img>；主頁的色塊把同一個檔案放進頁面裡（core/js/home.js），零件才能各自動。表上沒有的部門（測試用的水果部）用學生會的 favicon */
const deptLogo=id=>DEPT_EN[id]?`dept/icons/dept-${id}.svg`:"dept/icons/favicon.svg";
