/* 核心｜即時回報新手引導（2026-11-24，DievE：新手只看介面，不知道怎麼完成、刪除）
   第一次用的人（這台裝置沒看完過）：即時回報還沒有卡片時，右下角「＋」跳動並旁邊一句話；有卡片了，在第一張卡片上依序三個提示——
   ①完成（右上角出現綠角、卡片朝那邊輕點兩下）②刪除（左上角、紅角）③點卡片編輯（寫完不用按完成：點外面就存好；做完的事才拖到右上角。卡片上的「完成」鈕 2026-11-25 拿掉）；氣泡都在第一張卡片下面。
   看完或按「略過」就記在這台裝置（localStorage，只存一個「看過了」的記號，不上傳），不再出現；碰了卡片也算看過。設定頁「重看新手引導」把記號清掉再來一次。
   只有能編輯的人看得到（跟 nav.js 的 fabSync 同一個條件）：fabSync 每次重畫後把「現在能不能出現」交進來（tourSync），這裡自己等畫面穩了再判斷。
   提示氣泡 #tour 是 fixed 的一個節點，位置每次現量；不碰卡片的樣式（卡片被框起來用 .tour-hl）。 */
const TOUR_KEY="workboard:tour-live2",TOUR_N=3;   /* 記號 2026-11-25 換成 -live2：卡片上的「完成」鈕拿掉，看過舊引導的人再看一次拖曳完成（舊記號 workboard:tour-live 不再讀） */
/* 讀不到儲存空間（無痕、被擋）：當作看過，不要每次開頁都跳。自動化測試（navigator.webdriver）也當作看過：舊測試各自開頁、不會先點掉引導；引導自己的測試 tr1.js 把這個旗標蓋掉 */
const tourDone=()=>{try{return navigator.webdriver||localStorage.getItem(TOUR_KEY)==="1"}catch(_){return true}};
const tourMark=on=>{try{on?localStorage.setItem(TOUR_KEY,"1"):localStorage.removeItem(TOUR_KEY)}catch(_){}};
let tourI=-1,tourOn=false,tourTm=0,tourAn=null,tourAt=null;   /* tourI＝目前第幾步（-1＝沒在跑；切到別頁、開設定時只藏起來，步數留著，回來接著看） */
const tourCoarse=()=>matchMedia("(pointer:coarse)").matches;
const TOUR_TXT=[()=>tourCoarse()?"長按卡片，拖到右上角＝完成":"把卡片拖到右上角＝完成",()=>"拖到左上角＝刪除（會先確認）",()=>"點一下卡片＝編輯，離開卡片就存好，不用按完成。事情做完了再拖到右上角"];
const tourBox=()=>{let t=$("#tour");if(!t){document.body.insertAdjacentHTML("beforeend",`<div class="tour" id="tour" role="status" hidden><p class="tour-t"></p><div class="tour-bar"><span class="tour-n num"></span><button type="button" class="tour-skip" data-tourskip>略過</button><button type="button" class="tour-go" data-tournext></button></div></div>`);t=$("#tour")}return t};
const tourFirst=()=>document.querySelector("#events .cp:not(.lc-ghost)");

/* 示範：角落亮起來，第一張卡片在原位朝那一角輕輕點兩下就停（最多移 14px、歪 3 度，不離開清單、不蓋到別的東西；
   2026-11-24 實機回報：原本整張飛到角落、無限循環，看起來像卡住，還蓋住標題）。減少動態時只亮角落 */
function tourStopAnim(){
  if(tourAn){tourAn.cancel();tourAn=null}
  $("#lzDel")?.classList.remove("show");$("#lzOk")?.classList.remove("show");
  document.querySelectorAll(".tour-hl").forEach(x=>x.classList.remove("tour-hl"));
}
function tourDemo(k,el){
  const [zd,zo]=lvZone(),z=k==="ok"?zo:zd;z.style.setProperty("--k","1");z.classList.add("show");
  if(reduceMotion())return;
  const sx=k==="ok"?1:-1,to=`translate(${sx*14}px,-8px) rotate(${sx*3}deg)`;
  const an=tourAn=el.animate([{transform:"none",easing:"cubic-bezier(.4,0,.2,1)"},{transform:to,offset:.35,easing:"cubic-bezier(.4,0,.2,1)"},{transform:"none",offset:.7},{transform:"none"}],{duration:1300,iterations:2});
  an.onfinish=()=>{if(tourAn===an)tourAn=null};
}
/* 氣泡位置：第一張卡片下面（放不下就在上面），三步都在同一個地方、不蓋住示範的卡片與角落；＋鈕的提示在圓鈕左邊（CSS） */
function tourPlace(k,el){
  const b=tourBox();b.dataset.k=k;
  const r=el.getBoundingClientRect(),h=b.offsetHeight,room=innerHeight-r.bottom;
  const below=room>h+120||r.top<h+130;
  b.style.left=Math.max(16,Math.min(r.left+16,innerWidth-b.offsetWidth-16))+"px";
  b.style.top=(below?r.bottom+14:r.top-h-14)+"px";b.dataset.at=below?"b":"t";
}
function tourDraw(){
  const b=tourBox(),el=tourFirst();
  if(!el){tourHide();return}
  const k=["ok","del","edit"][tourI];
  if(!b.hidden&&tourAt&&tourAt[0]===tourI&&tourAt[1]===el){if(!tourAn)tourPlace(k,el);return}   /* 同一步、同一張卡片只是畫面重畫：只對位置，不重播示範 */
  tourStopAnim();tourAt=[tourI,el];
  b.querySelector(".tour-t").textContent=TOUR_TXT[tourI]();
  b.querySelector(".tour-n").textContent=`${tourI+1}/${TOUR_N}`;
  b.querySelector("[data-tournext]").textContent=tourI===TOUR_N-1?"知道了":"下一步";
  const was=b.hidden;b.hidden=false;
  tourPlace(k,el);   /* 先量位置（卡片還在原位）再開始示範 */
  if(k==="edit")el.classList.add("tour-hl");else tourDemo(k,el);
  if(was&&!reduceMotion())b.animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"none"}],{duration:MO.base,easing:MO.out});
}
function tourShow(i){tourI=i;tourDraw()}
/* 藏起來（切到別頁、開設定、搜尋中）：步數留著；結束＝看完、略過、碰了卡片，記在這台裝置 */
function tourHide(){tourAt=null;tourStopAnim();const b=$("#tour");if(b)b.hidden=true}
function tourEnd(){tourI=-1;tourHide();tourFab(false);tourMark(true)}
/* ＋鈕的提示（還沒有任何卡片）：圓鈕跳動、旁邊一句話；選單打開（.fab.open）時 CSS 藏起來 */
function tourFab(on){
  const fb=$("#addEvent");if(!fb)return;let h=$("#tourFab");
  fb.classList.toggle("tour-pulse",on);
  if(!on){if(h)h.hidden=true;return}
  if(!h){fb.insertAdjacentHTML("afterend",`<div class="tour tour-fab" id="tourFab" role="status">按這裡，新增第一張回報</div>`);h=$("#tourFab")}
  h.hidden=false;
}
/* 判斷現在該不該出現（畫面穩了才算：render 剛畫完時卡片還在進場）。條件變了就收掉 */
function tourEval(){
  tourTm=0;
  if(!tourOn||tourDone()||setOpen){tourFab(false);tourHide();return}
  if(!tourFirst()){tourHide();tourFab(true);return}
  tourFab(false);
  tourShow(Math.max(0,tourI));
}
/* fabSync（nav.js）每次重畫後呼叫：on＝圓鈕現在能出現＝能編輯、在即時回報、沒有卡片打開或編輯中 */
function tourSync(on){
  tourOn=on;clearTimeout(tourTm);
  if(!on){tourFab(false);if(tourI>=0&&lvOpen)tourEnd();else tourHide();return}   /* 引導中打開了卡片（鍵盤也算）＝已經在用了，算看完 */
  tourTm=setTimeout(tourEval,700);
}
/* 設定頁「重看新手引導」：清掉記號，關掉設定、回到即時回報重新開始 */
function tourReplay(){
  tourMark(false);tourI=-1;
  closeSettings();
  if(secTab("live")&&curSec!=="live")setSection("live");
  fabSync();   /* 圓鈕現在能不能出現重算一次，tourSync 接著排判斷 */
}
document.addEventListener("click",e=>{
  if(e.target.closest("#setOv [data-tour-replay]")){tourReplay();return}
  if(e.target.closest("[data-tourskip]")){tourEnd();return}
  if(e.target.closest("[data-tournext]")){tourI>=TOUR_N-1?tourEnd():tourShow(tourI+1);return}
});
/* 碰了卡片（點、按、拖）＝已經在用了：結束引導並記下，示範的動畫不要跟真的拖曳打架 */
document.addEventListener("pointerdown",e=>{if(tourI>=0&&e.target.closest&&e.target.closest("#events .cp"))tourEnd()},true);
addEventListener("resize",()=>{if(tourI>=0)tourDraw()});
