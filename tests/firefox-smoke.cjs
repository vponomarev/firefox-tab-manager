// Desktop uses an isolated profile. Android uses the disposable CI emulator only.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const android = process.env.FIREFOX_ANDROID === '1';
const adb = (...args) => execFileSync(process.env.ADB_BINARY || 'adb', ['-s', process.env.ANDROID_SERIAL || 'emulator-5554', ...args], {encoding:'utf8'});
(async () => {
  const root = path.resolve(__dirname,'..');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'tab-manager-smoke-'));
  let finish;
  async function verifyDownloads() {
    for (let i=0;i<60;i++) {
      try {
        const json=adb('shell','cat','/sdcard/Download/smoke-android.json');
        const csv=adb('shell','cat','/sdcard/Download/smoke-android.csv');
        if (JSON.parse(json)[0].title==='Android export' && csv.includes("'=1+1")) return {ok:true};
      } catch (_) { /* The Android download service is asynchronous. */ }
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    return {ok:false,files:adb('shell','ls','-l','/sdcard/Download')};
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.url==='/result'){
      let body='';for await(const chunk of req) body+=chunk;
      finish(JSON.parse(body));res.end('ok');return;
    }
    if(req.url==='/downloads'){
      res.end(JSON.stringify(await verifyDownloads()));return;
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
  const webExt=(await import('web-ext')).default;
  let runner,timer;
  const options={sourceDir:temporary,artifactsDir:temporary,noReload:true,noInput:true,
    ...(android ? {target:['firefox-android'],firefoxApk:'org.mozilla.firefox',adbDevice:process.env.ANDROID_SERIAL||'emulator-5554',adbBin:process.env.ADB_BINARY||'adb'} :
    {firefox:process.env.FIREFOX_BINARY||(process.platform==='win32'?'C:/Program Files/Mozilla Firefox/firefox.exe':'firefox'),args:['-headless']})};
  async function runPhase(phase,pendingTimestamp){
    const result=new Promise(resolve=>finish=resolve);
    await fs.writeFile(path.join(temporary,'smoke-driver.js'),'const SMOKE='+JSON.stringify({origin,android,phase,pendingTimestamp})+';\n'+driver);
    runner=await webExt.cmd.run(options,{shouldExitProgram:false});
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
