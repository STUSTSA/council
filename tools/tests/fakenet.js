/* 測試共用：假的外部網路（ui9fav、ui8home 圖示那一段用）。
   Playwright 只要開了攔截（任何 route），網址結尾是 /favicon.ico 的圖片請求就直接中止（不經過 route），測不到「網站有圖示」；
   所以要測網站圖示的段落不用 route，改用這個：開一個 https 小伺服器（自簽憑證，openssl 當場產生），
   瀏覽器用 --host-resolver-rules 把 127.0.0.1、localhost 以外的網域都指到它，並拿掉環境裡的 proxy 設定——不會真的連出去。
   用法：const net=await fakeNet(port,handle,hosts);const b=await chromium.launch(net.launch);
         分頁的 context 要 ignoreHTTPSErrors:true；net.extra＝預期外的外部請求（測試最後斷言它是空的）；net.close()。
   handle(q,r,{host,url,ref})：測試自己扮演的網域（各網站、Google 圖示服務），處理了回 true；
   沒處理的：fonts.googleapis.com 回空 CSS、api.github.com 回 404，其他記進 extra 並回 404。
   hosts：測試預期會連的網域（正規式）；自簽憑證第一次握手的「憑證不明」只對這些與 fonts、api.github.com 放過，其他 TLS 錯誤一律算預期外。
   IP 字面（例如 192.168.1.1）不經過 host-resolver-rules，要用 page.on('request') 另外記 */
const fs=require('fs'),os=require('os'),path=require('path'),https=require('https'),{execFileSync}=require('child_process');
module.exports=async function fakeNet(port,handle,hosts){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fakenet-'));let key,cert;
  try{execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(tmp,'k.pem'),'-out',path.join(tmp,'c.pem'),'-days','1','-subj','/CN=test.example'],{stdio:'ignore'});
    key=fs.readFileSync(path.join(tmp,'k.pem'));cert=fs.readFileSync(path.join(tmp,'c.pem'))}
  finally{fs.rmSync(tmp,{recursive:true,force:true})}
  const extra=[];
  const srv=https.createServer({key,cert},(q,r)=>{
    const host=String(q.headers.host||'').replace(/:\d+$/,''),url=new URL(q.url,'https://'+(host||'x')),ref=q.headers.referer||'';
    if(handle&&handle(q,r,{host,url,ref}))return;
    if(host==='fonts.googleapis.com'){r.writeHead(200,{'Content-Type':'text/css','Access-Control-Allow-Origin':'*'});return r.end('')}
    if(host==='api.github.com'){r.writeHead(404,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});return r.end('{}')}
    extra.push('https://'+host+q.url);r.writeHead(404);r.end()});
  srv.on('tlsClientError',(e,s)=>{const h=s&&s.servername||'';
    if(/CERTIFICATE_UNKNOWN/.test(e.code)&&(/^(fonts\.googleapis\.com|api\.github\.com)$/.test(h)||hosts&&hosts.test(h)))return;
    extra.push('（TLS '+h+' '+e.code+'）')});
  await new Promise(res=>srv.listen(port,'127.0.0.1',res));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/proxy/i.test(k)));
  return {extra,close:()=>srv.close(),
    launch:{env,args:[`--host-resolver-rules=MAP * 127.0.0.1:${port}, EXCLUDE 127.0.0.1, EXCLUDE localhost`]}};
};
