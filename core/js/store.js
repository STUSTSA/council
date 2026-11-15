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
   fsAdmin＝部門管理員或總管理員（部門設定）；fsDelOk＝議題、週報、標籤能不能刪（規則只給總管理員） */
const fsRole=()=>typeof acct!=="undefined"&&acct.user&&acct.roles?(acct.roles.super?"super":(acct.roles.depts||{})[CFG.deptId]||""):"";
const fsWriter=()=>fsMode()&&!!storeFsBase&&["super","admin","editor"].includes(fsRole());
const fsAdmin=()=>fsWriter()&&["super","admin"].includes(fsRole());
const fsDelOk=()=>!fsMode()||(fsWriter()&&fsRole()==="super");
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
function storeFsLoad(){
  if(!storeFsMod)storeFsMod=storeModLoad("store-firestore.js","board-firestore-ready","BoardFirestore");
  return storeFsMod.then(fs=>fs.loadDept(CFG.firebase,CFG.deptId));
}
/* 讀到的內容放上畫面，並記下這一份（寫入時拿它跟畫面比對，只寫改過的文件）；讀取失敗時 storeFsBase＝null（唯讀，不會把空白或舊的畫面存回去） */
let storeFsBase=null;
function storeFsUse(r){state=normalize(r.data);storeFsBase={src:r.src,orig:r.orig,state:JSON.parse(JSON.stringify(state))}}

/* ---------- 02D：firestore 模式的儲存（save.js 的 persist 交給這裡） ----------
   store-write.js 算出改了哪些文件、照規則要求的形狀分批寫入（每批規則讀取不超過 20 次）；每一批用交易，先確認文件還是上次讀到的版本，
   別人改過就整批不寫（不會互相蓋掉）。成功後重新讀這個部門。失敗：畫面上的修改留著，提示原因並可以重新載入。 */
let storeWriteMod=null,fsBusy=false;
const FS_ERR={conflict:"資料剛被別人改過，沒有儲存","permission-denied":"沒有權限，沒有儲存",unavailable:"沒有連上網路，沒有儲存",badtime:"時間格式不正確，沒有儲存"};
async function fsPersist(msg){
  if(fsBusy){toast("儲存中，請稍候");return false}
  if(!storeFsBase){toast(STORE_NOTE.firestore);return false}
  fsBusy=true;
  try{
    if(!storeWriteMod)storeWriteMod=storeModLoad("store-write.js","board-store-write-ready","BoardStoreWrite");
    const W=await storeWriteMod;
    await W.saveDept(CFG.firebase,CFG.deptId,storeFsBase,state,{admin:fsAdmin(),super:fsRole()==="super"});
  }catch(e){
    fsBusy=false;
    const m=(FS_ERR[e&&e.code]||"儲存失敗")+(e&&e.committed?"（部分修改已寫入）":"");
    toast(m);setTimeout(()=>fsFailAsk(m),0);
    return false;
  }
  try{storeFsUse(await storeFsLoad())}catch(_){storeFsBase=null}   /* 已寫入但重新讀取失敗：先唯讀，重新整理後再編輯 */
  fsBusy=false;render();toast(msg||"已儲存");return true;
}
/* 失敗時：重新載入＝放棄畫面上的修改、讀最新的內容；取消＝留在原畫面（修改還在） */
async function fsFailAsk(m){
  if(await ask("儲存失敗",[],{danger:"重新載入",note:m})!=="delete")return;
  editing=false;cardEdit="";dirty=false;evFld=null;ifFld=null;
  try{storeFsUse(await storeFsLoad())}catch(_){storeFsBase=null;toast("讀取失敗，請重新整理")}
  render();
}
