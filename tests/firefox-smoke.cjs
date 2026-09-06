// Desktop uses an isolated profile. Android uses the disposable CI emulator only.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const android = process.env.FIREFOX_ANDROID === '1';
const adb = (...args) => execFileSync(process.env.ADB_BINARY || 'adb', ['-s', process.env.ANDROID_SERIAL || 'emulator-5554', ...args], {encoding:'utf8',stdio:['ignore','pipe','ignore']});
(async () => {
  const root = path.resolve(__dirname,'..');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'tab-manager-smoke-'));
  let finish;
  async function verifyDownloads(kind) {
    const filename = kind === 'json' ? 'smoke-android.json' : 'smoke-android.csv';
    for (let i=0;i<40;i++) {
      try {
        const content=adb('shell','cat','/sdcard/Download/'+filename);
        if(kind==='json' ? JSON.parse(content)[0].title==='Android export' : content.includes("'=1+1"))return {ok:true};
      } catch (_) { /* Android downloads are asynchronous. */ }
      if(i%4===0){
        try {
          adb('shell','uiautomator','dump','/sdcard/smoke-window.xml');
          const xml=adb('shell','cat','/sdcard/smoke-window.xml');
          await fs.mkdir('android-diagnostics',{recursive:true});
          await fs.writeFile('android-diagnostics/download-window.xml',xml);
          const dom=new JSDOM(xml,{contentType:'application/xml'});
          for(const node of dom.window.document.querySelectorAll('node')){
            if(!['Download','ALLOW','Allow','Export smoke test',kind === 'json' ? 'Export JSON' : 'Export CSV'].includes(node.getAttribute('text')))continue;
            const bounds=node.getAttribute('bounds').match(/[0-9]+/g).map(Number);
            adb('shell','input','tap',String(Math.floor((bounds[0]+bounds[2])/2)),String(Math.floor((bounds[1]+bounds[3])/2)));
            console.log('Accepted Android download dialog: '+node.getAttribute('text'));
            break;
          }
          dom.window.close();
        } catch (_) { /* The dialog may disappear while polling. */ }
      }
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    return {ok:false,kind,files:adb('shell','ls','-l','/sdcard/Download')};
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.url==='/result'){
      let body='';for await(const chunk of req) body+=chunk;
      finish(JSON.parse(body));res.end('ok');return;
    }
    if(req.url.startsWith('/downloads?kind=')){
      res.end(JSON.stringify(await verifyDownloads(req.url.split('=')[1])));return;
    }
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><title>Loading</title><h1>Local test page</h1><script>setTimeout(()=>document.title="Final smoke title",150)</script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  if(android)adb('reverse','tcp:'+server.address().port,'tcp:'+server.address().port);
  for(const entry of await fs.readdir(path.join(root,'src'),{withFileTypes:true})){
    if(entry.isFile())await fs.copyFile(path.join(root,'src',entry.name),path.join(temporary,entry.name));
  }
  const manifest=JSON.parse(await fs.readFile(path.join(temporary,'manifest.json'),'utf8'));
  manifest.background.scripts.push('smoke-driver.js');
  await fs.writeFile(path.join(temporary,'manifest.json'),JSON.stringify(manifest));
  const driver=await fs.readFile(path.join(__dirname,'smoke-driver.js'),'utf8');
  await fs.writeFile(path.join(temporary,'smoke-export.html'), '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Export smoke test</title><h1>Export smoke test</h1><button id="json">Export JSON</button><button id="csv">Export CSV</button><script src="export.js"></script><script src="smoke-export.js"></script>');
  await fs.writeFile(path.join(temporary,'smoke-export.js'), 'const ORIGIN='+JSON.stringify(origin)+';\n'+await fs.readFile(path.join(__dirname,'smoke-export.js'),'utf8'));
  const webExt=(await import('web-ext')).default;
  let runner,timer;
  const options={sourceDir:temporary,artifactsDir:temporary,noReload:true,noInput:true,
    ...(android ? {target:['firefox-android'],firefoxApk:'org.mozilla.firefox',adbDevice:process.env.ANDROID_SERIAL||'emulator-5554',adbBin:process.env.ADB_BINARY||'adb'} :
    {firefox:process.env.FIREFOX_BINARY||(process.platform==='win32'?'C:/Program Files/Mozilla Firefox/firefox.exe':'firefox'),args:['-headless']})};
  async function dismissAddonNotice(){
    for(let i=0;i<10;i++){
      try{
        adb('shell','uiautomator','dump','/sdcard/addon-window.xml');
        const xml=adb('shell','cat','/sdcard/addon-window.xml');
        const dom=new JSDOM(xml,{contentType:'application/xml'});
        const nodes=Array.from(dom.window.document.querySelectorAll('node'));
        const added=nodes.some(n=>n.getAttribute('text')==='Tab & History Manager was added');
        const button=nodes.find(n=>n.getAttribute('resource-id')==='org.mozilla.firefox:id/confirm_button' && n.getAttribute('text')==='OK');
        if(added && button){
          const bounds=button.getAttribute('bounds').match(/[0-9]+/g).map(Number);
          adb('shell','input','tap',String(Math.floor((bounds[0]+bounds[2])/2)),String(Math.floor((bounds[1]+bounds[3])/2)));
          dom.window.close();console.log('Dismissed extension-added notice');return;
        }
        dom.window.close();
      }catch(_){}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
  }
  async function runPhase(phase,pendingTimestamp){
    const result=new Promise(resolve=>finish=resolve);
    await fs.writeFile(path.join(temporary,'smoke-driver.js'),'const SMOKE='+JSON.stringify({origin,android,phase,pendingTimestamp})+';\n'+driver);
    runner=await webExt.cmd.run(options,{shouldExitProgram:false});
    if(android)await dismissAddonNotice();
    try{
      const outcome=await Promise.race([result,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Firefox smoke timed out')),android?180000:60000);})]);
      console.log(JSON.stringify({phase,...outcome},null,2));
      if(!outcome.ok)throw Error(outcome.error);
      return outcome;
    } finally {clearTimeout(timer);await runner.exit();runner=undefined;}
  }
  try{
    const first=await runPhase('initial');
    if(android)await runPhase('resume',first.pendingTimestamp);
  }finally{
    if(runner)await runner.exit();server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
