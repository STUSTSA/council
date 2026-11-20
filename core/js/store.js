/* 核心｜資料來源轉接（01B，docs/architecture/migration.md 第 5 節）
   dept/config.js 每個部門的 source：
     "github"   ＝現狀：讀寫 repo 裡的 data*.json（預設，畫面與行為完全不變）
     "frozen"   ＝搬家中：照樣讀資料檔，但整個看板唯讀，任何寫入資料檔的路徑都擋下（凍結只靠程式設定，不寫資料檔的 locked）
     "firestore"＝讀寫 Cloud Firestore（讀 core/js/store-firestore.js、寫 core/js/store-write.js）。02B 起用 Google 登入（core/js/account.js）；
                 02D 起有這個部門角色（編輯者、管理員）或總管理員的人可以編輯，其他人唯讀。真正的把關是 Security Rules，畫面只照角色顯示
   Firestore 讀回來的資料由 store-map.js 轉成跟資料檔一樣的格式，再交給 normalize，所以上層的 state 與 render 不變。 */
const STORE_SOURCES=["github","frozen","firestore"];
const deptSourceOf=id=>{const d=BOARD_DEPTS.find(x=>x.id===id);return d&&STORE_SOURCES.includes(d.source)?d.source:"github"};
const storeSource=()=>deptSourceOf(CFG.deptId);
const fsMode=()=>storeSource()==="firestore";
/* 02D：firestore 模式的編輯權限＝Google 登入的角色（account.js 的 acct.roles，即時監聽，撤權時畫面立刻變回唯讀），而且這次讀取成功（storeFsBase）。
   fsAdmin＝部門管理員或總管理員（部門設定）；fsDelOk＝議題、週報、標籤能不能刪（02D D-d：部門管理員或總管理員，規則要求同批寫刪除紀錄） */
const fsRole=()=>typeof acct!=="undefined"&&acct.user&&acct.roles?(acct.roles.super?"super":(acct.roles.depts||{})[CFG.deptId]||""):"";
const fsWriter=()=>fsMode()&&!!storeFsBase&&["super","admin","editor"].includes(fsRole());
const fsAdmin=()=>fsWriter()&&["super","admin"].includes(fsRole());
const fsDelOk=()=>!fsMode()||fsAdmin();
const storeLocked=()=>storeSource()!=="github"&&!fsWriter();
const boardLocked=()=>!!state.locked||storeLocked();   /* 看板唯讀：定型版（state.locked）、凍結、或 firestore 模式沒有編輯權限 */
const STORE_NOTE={frozen:"這個部門正在搬到新資料庫，暫停編輯。",firestore:"這個部門已搬到新資料庫，目前只能檢視。"};
/* Firestore 模式：第一次用到才載入橋接模組（type=module，SDK 從 gstatic 載入）；回傳 {data（schemaVersion 13 格式）, src, orig}（store-firestore.js） */
let storeFsMod=null;
function storeModLoad(file,ev,name){
  return new Promise((ok,no)=>{
    if(window[name])return ok(window[name]);
    addEventListener(ev,()=>ok(window[name]),{once:true});
    const s=document.createElement("script");s.type="module";s.src="core/js/"+file;s.onerror=()=>no(new Error("load"));
    document.head.append(s);
  });
}
const storeFsGet=()=>storeFsMod||(storeFsMod=storeModLoad("store-firestore.js","board-firestore-ready","BoardFirestore"));
function storeFsLoad(){return storeFsGet().then(fs=>fs.loadDept(CFG.firebase,CFG.deptId))}
/* 02D D-b：跨部門讀取（會長室追蹤、秘書處讀各部門、讀秘書處學年設定、行事曆的「會長室」「其他」）跟著那個部門的資料來源：
   firestore 的部門讀新資料庫（跟它自己的看板同一組查詢；要登入才讀得到＝permission-denied），github／frozen 的部門照舊讀資料檔（呼叫端）。
   回傳 schemaVersion 13 格式的部門資料（還沒 normalize） */
function storeDeptFull(id){   /* {data, src, orig}：秘書處的會議編輯要留著 src／orig 才能寫回（meeting.js） */
  if(!(CFG.firebase&&CFG.firebase.projectId))return Promise.reject(Object.assign(new Error("firebase"),{code:"unavailable"}));
  return storeFsGet().then(fs=>fs.loadDept(CFG.firebase,id));
}
const storeDeptData=id=>storeDeptFull(id).then(r=>r.data);
/* ui-06：行事曆的「活動」「會議」（scope 是 all-activity／all-meeting 的時間事件）。只有新資料庫有 scope：
   有部門已切到 firestore 時才讀（要登入）；都還在 github／frozen 時讀不到這一類（storeScopeOn 為假，畫面顯示空的）。
   測試部門（test:true，例如實測 Google 登入時的水果部）切到 firestore 不算：不讓一個測試部門改變其他部門與主頁全會行事曆的行為（2026-11-19） */
const storeScopeOn=()=>!!(CFG.firebase&&CFG.firebase.projectId)&&BOARD_DEPTS.some(d=>d.source==="firestore"&&!d.test);
function storeScopeEvents(scope,from,to,o){return storeFsGet().then(fs=>fs.eventsByScope(CFG.firebase,scope,from,to,o))}   /* o.pub＝公共版（沒登入時只查公開事件） */
/* 讀取新資料庫失敗時把原始錯誤記到 console（2026-11-20：開發專案缺索引時畫面只寫「讀取失敗」、查不到原因）。畫面照舊只顯示簡短原因：
   原始訊息可能含專案網址與建索引的連結，不放上畫面。沒登入或沒權限（permission-denied）是預期中會發生的，用 warn */
const fsReadErr=(where,e)=>{(e&&e.code==="permission-denied"?console.warn:console.error)(`Firestore 讀取失敗（${where}）`,e)};
const STORE_XERR=e=>e&&e.code==="permission-denied"?"這個部門已搬到新資料庫，登入後才看得到":"讀不到這個部門的資料";
/* 02D：稽核紀錄屬於哪個部門（編輯紀錄、各部門編輯量用）：部門設定的修改＝那個部門；卡片刪除、議題／週報／標籤的刪除（D-d）＝被刪文件的部門；其他（角色、邀請、遷移）不算 */
const fsAuditDept=a=>a.col==="deptSettings"&&a.action==="update"?a.docId
  :(a.col==="cards"&&a.action==="purge")||(["issues","weeks","labels"].includes(a.col)&&a.action==="delete")?(a.before||{}).deptId||"":"";
/* 讀到的內容放上畫面，並記下這一份（寫入時拿它跟畫面比對，只寫改過的文件）；讀取失敗時 storeFsBase＝null（唯讀，不會把空白或舊的畫面存回去） */
let storeFsBase=null;
function storeFsUse(r){state=normalize(r.data);storeFsBase={src:r.src,orig:r.orig,state:JSON.parse(JSON.stringify(state))}}

/* ---------- 02D：firestore 模式的儲存（save.js 的 persist 交給這裡） ----------
   store-write.js 算出改了哪些文件、照規則要求的形狀分批寫入（每批規則讀取不超過 20 次）；每一批用交易，先確認文件還是上次讀到的版本，
   別人改過就整批不寫（不會互相蓋掉）。成功後重新讀這個部門。失敗：畫面上的修改留著，提示原因並可以重新載入。
   02D 審查：前面的批已寫入、後面失敗（e.committed＞0）時，重新讀一次，用新讀到的內容當比對基準，只補寫這次要寫、還沒寫進去的文件
   （fsFinish；最多試 3 輪）。期間被別人改過的文件不寫，比對基準留在舊的那一份（下次儲存照樣被版本檢查擋下，不會蓋掉別人的）。 */
let storeWriteMod=null,fsBusy=false,fsLastErr="";
const storeWriteGet=()=>storeWriteMod||(storeWriteMod=storeModLoad("store-write.js","board-store-write-ready","BoardStoreWrite"));
const FS_ERR={conflict:"資料剛被別人改過，沒有儲存","permission-denied":"沒有權限，沒有儲存",unavailable:"沒有連上網路，沒有儲存",badtime:"時間格式不正確，沒有儲存"};
const FS_PART={conflict:"部分修改已寫入；有的資料剛被別人改過，那部分沒有儲存（還在畫面上）","permission-denied":"部分修改已寫入；其餘沒有權限、沒有儲存（還在畫面上）",
  unavailable:"部分修改已寫入；其餘因為沒有連上網路沒有儲存（還在畫面上）"};
/* o.quiet（03 原位編輯器）：成功、失敗都不跳提示與對話框，失敗原因放在 fsLastErr（畫面在卡片上顯示儲存回饋） */
async function fsPersist(msg,o={}){
  fsLastErr="";
  if(fsBusy){if(!o.quiet)toast("儲存中，請稍候");fsLastErr="儲存中";return false}
  if(!storeFsBase){if(!o.quiet)toast(STORE_NOTE.firestore);fsLastErr="只能檢視";return false}
  fsBusy=true;
  const opt={admin:fsAdmin(),super:fsRole()==="super"};
  let err=null,W=null;
  try{
    W=await storeWriteGet();
    await W.saveDept(CFG.firebase,CFG.deptId,storeFsBase,state,opt);
  }catch(e){err=e}
  if(err&&err.committed>0&&err.draft){toast("部分修改已寫入，正在補寫其餘的修改…");err=await fsFinish(W,err,opt)}
  if(err){
    fsBusy=false;
    const m=err.part?(FS_PART[err.code]||"部分修改已寫入；其餘沒有儲存（還在畫面上）"):(FS_ERR[err&&err.code]||"儲存失敗");
    fsLastErr=err.part?"部分修改已寫入":({conflict:"資料剛被別人改過","permission-denied":"沒有權限",unavailable:"沒有連上網路",badtime:"時間格式不正確"})[err&&err.code]||"";
    if(!o.quiet){toast(m);setTimeout(()=>fsFailAsk(m),0)}
    return false;
  }
  try{storeFsUse(await storeFsLoad())}catch(e){fsReadErr("儲存後重新讀取",e);storeFsBase=null}   /* 已寫入但重新讀取失敗：先唯讀，重新整理後再編輯 */
  fsBusy=false;render();if(!o.quiet)toast(msg||"已儲存");return true;
}
/* 補寫：e.draft＝這次要存的畫面資料（完成這一段換過 ID 的時間標記用新的 ID，重試不會再建一份）、e.intended＝這次要寫的文件。
   回傳 null＝全部寫完；否則回傳錯誤（e.part＝已經寫入一部分）。畫面上的修改一律留著 */
async function fsFinish(W,e,opt){
  const prev=storeFsBase,only=e.intended,draft=e.draft;
  state=draft;
  for(let i=0;i<3;i++){
    let r;try{r=await storeFsLoad()}catch(_){return Object.assign(e,{part:true})}   /* 讀不到：比對基準不變，提示後由使用者重新載入 */
    storeFsBase={src:r.src,orig:r.orig,state:JSON.parse(JSON.stringify(normalize(r.data)))};
    try{await W.saveDept(CFG.firebase,CFG.deptId,storeFsBase,state,{...opt,only,prev:prev.src});return null}
    catch(e2){
      if(e2.draft)state=e2.draft;
      if(e2.blocked&&e2.blocked.length){fsHold(prev,e2.blocked);return Object.assign(e2,{part:true,code:"conflict"})}
      if(!(e2.committed>0))return Object.assign(e2,{part:true});
      e=e2;   /* 又寫進去一部分：再讀一次、繼續補 */
    }
  }
  return Object.assign(e,{part:true});
}
/* 被別人改過、這次沒寫的文件：比對基準換回上次讀到的那一份（下次儲存時版本不同＝被擋下，不會蓋掉別人剛存的內容） */
function fsHold(prev,paths){
  const b=storeFsBase;
  for(const p of paths){
    const [col,id]=p.split("/");
    if(col==="deptSettings"){b.src.settings=prev.src.settings;b.orig.settings=prev.orig.settings;continue}
    const old=(prev.src[col]||[]).find(d=>d.id===id),list=(b.src[col]||[]).filter(d=>d.id!==id);
    b.src[col]=old?list.concat([old]):list;
    if(prev.orig[col]&&prev.orig[col][id])b.orig[col][id]=prev.orig[col][id];
  }
  b.state=JSON.parse(JSON.stringify(normalize(StoreMap.toState(CFG.deptId,b.src))));   /* 比對的畫面資料也照這一份重算（被別人刪掉的不會被當成新的再建一次） */
}
/* 失敗時：重新載入＝放棄畫面上的修改、讀最新的內容；取消＝留在原畫面（修改還在） */
async function fsFailAsk(m){
  if(await ask("儲存失敗",[],{danger:"重新載入",note:m})!=="delete")return;
  editing=false;cardEdit="";dirty=false;evFld=null;ifFld=null;
  try{storeFsUse(await storeFsLoad())}catch(e){fsReadErr("重新載入",e);storeFsBase=null;toast("讀取失敗，請重新整理")}
  render();
}
