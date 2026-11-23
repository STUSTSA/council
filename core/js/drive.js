/* 核心｜存到 Google 雲端硬碟（2026-11-23）
   把「行政會議資料」「會議紀錄」存成 Google 文件，放進學生會的雲端資料夾。沒有新增伺服器：
   登入者用自己的 Google 帳號（Google Identity Services）臨時取得權限 drive.file（只能碰「這個網站建立或選過的檔案、資料夾」，不能看整個雲端硬碟）；
   資料夾用 Google Picker 選一次，資料夾 ID 記在這台裝置（localStorage），不上傳、不進 repo。權杖只留在記憶體裡，不存、不印。
   還沒填 clientId（OAuth 用戶端 ID，網頁設定不是機密）時，按鈕整個藏起來。設定步驟見 docs/雲端硬碟設定.md。 */
const DRIVE={
  clientId:"",   /* OAuth 網頁用戶端 ID（xxxx.apps.googleusercontent.com）；DievE 照 docs/雲端硬碟設定.md 取得後填這裡 */
  scope:"https://www.googleapis.com/auth/drive.file",
  key:"council.driveFolder",tok:null,exp:0,folder:null
};
const driveReady=()=>!!DRIVE.clientId&&!!(CFG.firebase&&CFG.firebase.apiKey);
const driveLoad=src=>new Promise((ok,no)=>{
  const o=[...document.scripts].find(s=>s.src===src);if(o&&o.dataset.done){ok();return}
  const s=o||document.createElement("script");s.onload=()=>{s.dataset.done="1";ok()};s.onerror=()=>no(new Error("load"));
  if(!o){s.src=src;s.async=true;document.head.appendChild(s)}
});
const driveFolderGet=()=>{try{return localStorage.getItem(DRIVE.key)||""}catch(_){return ""}};
const driveFolderSet=v=>{try{v?localStorage.setItem(DRIVE.key,v):localStorage.removeItem(DRIVE.key)}catch(_){}};
/* 取得（或沿用還沒過期的）存取權限；一定要在按鈕的點擊裡呼叫，瀏覽器才不擋跳出視窗 */
async function driveToken(force){
  if(!force&&DRIVE.tok&&Date.now()<DRIVE.exp)return DRIVE.tok;
  await driveLoad("https://accounts.google.com/gsi/client");
  return new Promise((ok,no)=>{
    const c=google.accounts.oauth2.initTokenClient({client_id:DRIVE.clientId,scope:DRIVE.scope,
      callback:r=>{if(r&&r.access_token){DRIVE.tok=r.access_token;DRIVE.exp=Date.now()+(Math.max(60,+r.expires_in||3600)-60)*1000;ok(DRIVE.tok)}else no(new Error(r&&r.error||"auth"))},
      error_callback:e=>no(new Error(e&&e.type||"auth"))});
    c.requestAccessToken({prompt:DRIVE.tok?"":"select_account"});
  });
}
/* 選資料夾（Google Picker）：選到的資料夾才有權限寫入；可選「共用雲端硬碟」裡的資料夾 */
async function drivePick(tok){
  await driveLoad("https://apis.google.com/js/api.js");
  await new Promise(r=>gapi.load("picker",r));
  const no=String(CFG.firebase.appId||"").split(":")[1]||"";
  return new Promise(ok=>{
    const v=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes("application/vnd.google-apps.folder");
    const p=new google.picker.PickerBuilder().addView(v).setOAuthToken(tok).setDeveloperKey(CFG.firebase.apiKey).setAppId(no).setTitle("選存放的雲端資料夾").setLocale("zh-TW")
      .setCallback(d=>{const a=d[google.picker.Response.ACTION];if(a===google.picker.Action.PICKED)ok((d[google.picker.Response.DOCUMENTS][0]||{})[google.picker.Document.ID]||"");else if(a===google.picker.Action.CANCEL)ok("")}).build();
    p.setVisible(true);
  });
}
const driveName=s=>String(s||"").replace(/[\\/:*?"<>|]/g,"_").slice(0,80)||"會議資料";
/* 上傳並轉成 Google 文件（網頁文字自動轉格式）；回傳 {id,link} */
async function driveUpload(tok,folder,name,html){
  const b="cb"+Math.random().toString(36).slice(2),meta={name:driveName(name),mimeType:"application/vnd.google-apps.document",parents:[folder]};
  const body=`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${b}--`;
  const r=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",{method:"POST",headers:{Authorization:"Bearer "+tok,"Content-Type":"multipart/related; boundary="+b},body});
  if(!r.ok){const e=new Error("http");e.status=r.status;throw e}
  const j=await r.json();return{id:j.id,link:j.webViewLink||""};
}
const driveHTML=(title,inner)=>`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>${inner}</body></html>`;
/* 純文字（議程）轉成簡單 HTML：每段一個 <p>，段內換行用 <br> */
const driveText=(title,t)=>driveHTML(title,String(t||"").split(/\n{2,}/).map(p=>`<p>${esc(p).replace(/\n/g,"<br>")}</p>`).join(""));
let driveBusy=false;
async function driveSave(name,html,again){
  if(!driveReady()){toast("雲端硬碟還沒設定好");return false}
  if(driveBusy)return false;driveBusy=true;
  try{
    const tok=await driveToken();
    let f=again?"":driveFolderGet();
    if(!f){toast("請選要存放的雲端資料夾");f=await drivePick(tok);if(!f){driveBusy=false;return false}driveFolderSet(f)}
    try{const r=await driveUpload(tok,f,name,html);toast("已存到雲端："+driveName(name));driveBusy=false;return r}
    catch(e){
      if(e.status===401){DRIVE.tok=null;driveBusy=false;return driveSave(name,html,again)}   /* 權限過期：重取一次 */
      if(e.status===404||e.status===403){driveFolderSet("");toast("找不到這個資料夾，請重新選");driveBusy=false;return driveSave(name,html,true)}
      throw e;
    }
  }catch(e){console.error(e&&e.message);toast("沒有存到雲端：沒有取得權限或網路有問題");driveBusy=false;return false}
}
