// Runs the production extension plus a test driver in a disposable Firefox profile.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
(async () => {
  const root = path.resolve(__dirname, "..");
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "tab-manager-smoke-"),
  );
  let finish;
  const result = new Promise((resolve) => (finish = resolve));
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.url === "/result") {
      let body = "";
      for await (const chunk of req) body += chunk;
      finish(JSON.parse(body));
      res.end("ok");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><title>Loading</title><h1>Local test page</h1><script>setTimeout(()=>document.title="Final smoke title",150)</script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  for (const entry of await fs.readdir(path.join(root, "src"), {
    withFileTypes: true,
  })) {
    if (entry.isFile())
      await fs.copyFile(
        path.join(root, "src", entry.name),
        path.join(temporary, entry.name),
      );
  }
  const manifest = JSON.parse(
    await fs.readFile(path.join(temporary, "manifest.json"), "utf8"),
  );
  manifest.background.scripts.push("smoke-driver.js");
  await fs.writeFile(
    path.join(temporary, "manifest.json"),
    JSON.stringify(manifest),
  );
  const driver = String.raw`
(async()=>{
 const checks=[];
 const assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function wait(predicate){for(let i=0;i<100;i++){if(await predicate())return;await sleep(100);}throw Error('Timed out');}
 async function frame(page){const f=document.createElement('iframe');f.style.width='375px';f.style.height='800px';document.body.append(f);
  const loaded=new Promise(r=>f.onload=r);f.src=browser.runtime.getURL(page);await loaded;return f;}
 try{
  await VisitStore.initialize();
  const url=ORIGIN+'/fixture?long='+ 'x'.repeat(400);
  const tab=await browser.tabs.create({url});
  await wait(async()=>{const p=await VisitStore.query();return p.items.some(x=>x.url===url&&x.title==='Final smoke title');});
  let record=(await VisitStore.query()).items.find(x=>x.url===url);
  assert(record.visitCount===1,'one real navigation is recorded once');
  await browser.tabs.reload(tab.id);
  await wait(async()=>{const p=await VisitStore.query();return p.items.find(x=>x.url===url)?.visitCount===2;});
  await wait(async()=>tracker.status().pending===0 && (await VisitStore.query()).items.find(x=>x.url===url)?.title==='Final smoke title');
  assert((await VisitStore.query()).items.find(x=>x.url===url).title==='Final smoke title','late title is persisted after reload');
  const f=await frame('visits.html');
  await wait(()=>f.contentDocument.querySelector('#visits-body a'));
  assert(f.contentWindow.getComputedStyle(f.contentDocument.querySelector('tbody')).display==='block','375px layout uses cards');
  assert(f.contentDocument.documentElement.scrollWidth<=f.contentDocument.documentElement.clientWidth,'375px page has no horizontal overflow');
  const list=await frame('list.html');
  await wait(()=>list.contentDocument.querySelector('#tabs-body .title'));
  assert(list.contentDocument.querySelectorAll('#tabs-body .title').length>=1,'real tabs list renders');
  await tracker.remove(url);
  assert(!(await VisitStore.query()).items.some(x=>x.url===url),'deletion removes the record');
  await browser.tabs.remove(tab.id);
  await fetch(ORIGIN+'/result',{method:'POST',body:JSON.stringify({ok:true,checks,firefox:(await browser.runtime.getBrowserInfo()).version})});
 }catch(error){await fetch(ORIGIN+'/result',{method:'POST',body:JSON.stringify({ok:false,checks,error:String(error),stack:error.stack})});}
})();
`;
  await fs.writeFile(
    path.join(temporary, "smoke-driver.js"),
    "const ORIGIN=" +
      JSON.stringify(origin) +
      ";\n".replace("\\n", "\n") +
      driver,
  );
  const webExt = (await import("web-ext")).default;
  let runner, timer;
  try {
    runner = await webExt.cmd.run(
      {
        sourceDir: temporary,
        artifactsDir: temporary,
        firefox:
          process.env.FIREFOX_BINARY ||
          (process.platform === "win32"
            ? "C:/Program Files/Mozilla Firefox/firefox.exe"
            : "firefox"),
        args: ["-headless"],
        noReload: true,
        noInput: true,
        pref: ["browser.shell.checkDefaultBrowser=false"],
      },
      { shouldExitProgram: false },
    );
    const outcome = await Promise.race([
      result,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Firefox smoke timed out")),
          45000,
        );
      }),
    ]);
    console.log(JSON.stringify(outcome, null, 2));
    if (!outcome.ok) process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    if (runner) await runner.exit();
    server.close();
    // Keep the temporary test source for diagnosis; Firefox uses its own disposable profile.
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
