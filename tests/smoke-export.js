document.addEventListener('DOMContentLoaded', async () => {
  try {
    document.getElementById('json').onclick = () => ExportUtils.exportJson('smoke-android.json', [{title:'Android export', url:ORIGIN+'/fixture'}]);
    document.getElementById('csv').onclick = () => ExportUtils.exportCsv('smoke-android.csv', ['Title','URL'], [['=1+1',ORIGIN+'/fixture']]);
    const json = await (await fetch(ORIGIN+'/downloads?kind=json')).json();
    if(!json.ok)throw Error(JSON.stringify(json));
    const csv = await (await fetch(ORIGIN+'/downloads?kind=csv')).json();
    if(!csv.ok)throw Error(JSON.stringify(csv));
    await browser.runtime.sendMessage({type:'smoke-export-result',result:{ok:true}});
  } catch(error) {
    await browser.runtime.sendMessage({type:'smoke-export-result',result:{ok:false,error:String(error)}});
  }
});
