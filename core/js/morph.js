/* 核心｜原位更新 morphTo(el, html)（新介面第 3 步；docs/DESIGN-next.md 第五節「畫面更新」）
   同一個畫面重畫時不整段換掉 innerHTML，而是拿新的 HTML 跟畫面上現有的節點比對，只改有變的屬性、文字與節點：
   - 沒變的節點原封不動（同一個 DOM 節點）：CSS 動畫、圖示正在播的動作、捲動位置、程式掛在節點上的狀態都留著，也不會被當成新的而重跑進場動畫。
   - 配對：有 id 或 MORPH_KEYS 裡的 data 屬性的，用「標籤＋那個值」配對同一筆（換順序時搬動，不重建）；沒有的照順序配對同標籤、同第一個 class 的。
   - 正在輸入的欄位（document.activeElement）不覆寫 value 與選取範圍；正在編輯的 contenteditable 整塊不動。
     搬動節點時不搬含有焦點的那一個（改搬它前面的兄弟），焦點與手機鍵盤不會掉。
   - 程式在執行時自己加的 class（MORPH_RT：圖示動作 ico-on、展開收合 opening／closing／animating、拖曳中…）不會被拿掉；
     新的 HTML 沒寫 style 時保留節點上程式寫的 style（動畫、拖曳、FLIP 的暫時位移）。
   - <details> 展開收合時 motion.js 會把內容包進 .dwrap：比對時把新 HTML 的內容當成在 .dwrap 裡，不會因為多一層而整塊重建。
   - SVG（圖示、標誌）內部不逐一比對：整段一樣就不動，不一樣才換掉。
   第一次畫（容器是空的）或換成完全不同的內容時，結果跟 innerHTML 一樣是新建的節點。不依賴其他檔案。 */
const MORPH_KEYS=["key","ev","done","issue","blk","lk","tp","dk","week","fw","fk","set","hub","zone","kpf"];
const MORPH_RT=["ico-on","ico-once","opening","closing","animating","ev-dragging","sec-anim","peek","peeking","flash","lit","hov"];
const morphCls=n=>{for(const c of n.classList)if(!MORPH_RT.includes(c))return c;return ""};   /* 第一個 class（不算程式執行時加的） */
const morphKey=n=>{if(n.nodeType!==1)return "";if(n.id)return "#"+n.id;const d=n.dataset;if(!d)return "";for(const k of MORPH_KEYS){const v=d[k];if(v!=null&&v!=="")return k+":"+v}return ""};
/* 把 node 放到 ref 的位置。node 含有焦點時不搬它（搬了會失焦），改把 ref 到 node 之間的兄弟搬到 node 後面 */
function morphPlace(p,node,ref){
  if(node===ref)return;
  const act=document.activeElement;
  if(act&&act!==document.body&&node.contains(act)){const after=node.nextSibling;let x=ref;while(x&&x!==node){const nx=x.nextSibling;p.insertBefore(x,after);x=nx}return}
  p.insertBefore(node,ref);
}
function morphKids(a,b){
  /* <details> 的內容被 motion.js 包進 .dwrap：新的內容（summary 以外）也放進一個同樣的 .dwrap 再比對 */
  if(a.tagName==="DETAILS"){const w=a.querySelector(":scope>.dwrap");if(w&&!b.querySelector(":scope>.dwrap")){const v=w.cloneNode(false);[...b.childNodes].forEach(n=>{if(!(n.nodeType===1&&n.tagName==="SUMMARY"))v.append(n)});b.append(v)}}
  const keyed=new Map(),want=new Set();
  for(const c of a.children){const k=morphKey(c);if(k&&!keyed.has(c.tagName+k))keyed.set(c.tagName+k,c)}
  for(const c of b.children){const k=morphKey(c);if(k)want.add(c.tagName+k)}
  let cur=a.firstChild;
  for(const n of [...b.childNodes]){
    /* 新的 HTML 裡已經沒有的那一筆（有 key 的）先拿掉，後面的才對得上位置 */
    while(cur&&cur.nodeType===1&&morphKey(cur)&&!want.has(cur.tagName+morphKey(cur))){const nx=cur.nextSibling;keyed.delete(cur.tagName+morphKey(cur));cur.remove();cur=nx}
    let m=null;const k=morphKey(n);
    if(k){m=keyed.get(n.tagName+k)||null;keyed.delete(n.tagName+k)}
    else{const c=cur;if(c&&c.nodeType===n.nodeType&&!morphKey(c)&&(n.nodeType!==1||(c.tagName===n.tagName&&morphCls(c)===morphCls(n))))m=c}
    if(m){morphPlace(a,m,cur);cur=m.nextSibling;morphNode(m,n)}
    else a.insertBefore(n,cur);
  }
  while(cur){const nx=cur.nextSibling;cur.remove();cur=nx}
}
function morphNode(a,b){
  if(a.nodeType!==1){if(a.data!==b.data)a.data=b.data;return}
  const act=document.activeElement,focused=a===act,t=a.tagName;
  /* 正在編輯的 contenteditable：整塊不動 */
  if(a.isContentEditable&&act&&a.contains(act)&&!(a.parentElement&&a.parentElement.isContentEditable))return;
  for(const {name,value} of [...b.attributes]){
    let v=value;
    if(name==="class"){const keep=MORPH_RT.filter(c=>a.classList.contains(c)&&!b.classList.contains(c));if(keep.length)v=(v+" "+keep.join(" ")).trim()}
    if(name==="value"&&focused)continue;   /* 正在輸入：value 屬性也不動（沒打過字的欄位改屬性會改到畫面上的值） */
    if(a.getAttribute(name)!==v)a.setAttribute(name,v);
  }
  for(const {name} of [...a.attributes]){
    if(b.hasAttribute(name)||name==="style")continue;   /* 新的 HTML 沒寫 style：留著程式寫的（動畫、拖曳） */
    if(name==="class"){const keep=MORPH_RT.filter(c=>a.classList.contains(c));if(keep.length){a.setAttribute("class",keep.join(" "));continue}}
    a.removeAttribute(name);
  }
  if(t==="INPUT"){
    if(a.type==="checkbox"||a.type==="radio"){const c=b.hasAttribute("checked");if(a.checked!==c)a.checked=c}
    else if(!focused){const v=b.getAttribute("value")??"";if(a.value!==v)a.value=v}
    return;
  }
  if(t==="TEXTAREA"){if(!focused){if(a.defaultValue!==b.defaultValue)a.defaultValue=b.defaultValue;if(a.value!==b.defaultValue)a.value=b.defaultValue}return}
  if(a instanceof SVGElement&&t.toLowerCase()==="svg"){if(a.innerHTML!==b.innerHTML)a.innerHTML=b.innerHTML;return}
  morphKids(a,b);
  if(t==="SELECT"&&!focused){const o=[...b.options].find(x=>x.hasAttribute("selected"))||b.options[0];if(o&&a.value!==o.value)a.value=o.value}
}
/* el 的內容換成 html：只改有變的地方。el 本身（容器）不動 */
function morphTo(el,html){
  if(!el)return;
  const t=document.createElement("template");t.innerHTML=html;
  morphKids(el,t.content);
}
/* el 本身換成 html（一個根節點）：根節點同標籤就原位更新，不同才整個換掉 */
function morphOuter(el,html){
  if(!el)return;
  const t=document.createElement("template");t.innerHTML=html.trim();const n=t.content.firstElementChild;
  if(n&&t.content.childElementCount===1&&n.tagName===el.tagName)morphNode(el,n);else el.replaceWith(t.content);
}
