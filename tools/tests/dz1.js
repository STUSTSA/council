/* 拖到角落的完成／刪除區不被固定頂部蓋住（手機寬度）*/
const {setup}=require('./common.js');
(async()=>{const h=await setup();const p=await h.mk(412,915,'light',true);await p.waitForTimeout(3500);await h.login(p);
const m=await p.evaluate(()=>{const c=document.querySelector('#events .cp');const b=c.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]});
// 觸控長按拖曳：用 CDP 觸控
const cdp=await p.context().newCDPSession(p);
const t=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
await t('touchStart',m[0],m[1]);await p.waitForTimeout(600);
for(let i=1;i<=10;i++){await t('touchMove',m[0]+(380-m[0])*i/10,m[1]+(40-m[1])*i/10);await p.waitForTimeout(30)}
await p.waitForTimeout(500);
const r=await p.evaluate(()=>{const out={};for(const id of ['lzOk','lzDel']){const z=document.getElementById(id),b=z.getBoundingClientRect();const e=document.elementFromPoint(id==='lzOk'?b.right-3:b.left+3,b.top+3);const pt=[id==='lzOk'?b.right-60:b.left+60,b.top+60];out[id]={z:getComputedStyle(z).zIndex,op:getComputedStyle(z).opacity,topAtCorner:document.elementsFromPoint(pt[0],pt[1]).slice(0,3).map(n=>n.id||n.className)}}
const d=document.querySelector('.cp.drag');out.drag=d?document.elementsFromPoint(d.getBoundingClientRect().x+20,d.getBoundingClientRect().y+10).slice(0,3).map(n=>n.id||n.className):null;return out});
console.log(JSON.stringify(r));console.log(await p.evaluate(()=>{const w=document.querySelector('.wrap');return w.style.cssText+' | '+getComputedStyle(w).transform+' | anims='+w.getAnimations().map(a=>a.animationName||a.constructor.name+':'+a.playState).join(',')+' | '+w.className}));console.log((await p.evaluate(()=>{const o=[];let e=document.querySelector('.cp.drag');while(e&&e!==document.documentElement){const c=getComputedStyle(e);o.push(e.tagName+'#'+e.id+'.'+e.className+' z='+c.zIndex+' pos='+c.position+' tf='+c.transform.slice(0,12)+' op='+c.opacity+' ct='+c.contain+' wc='+c.willChange+' fl='+c.filter);e=e.parentElement}return o})).join('\n'));await p.screenshot({path:process.argv[2]||'/tmp/dz1.png'});
await t('touchEnd');await h.b.close()})()
