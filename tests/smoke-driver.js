// Test-only driver, appended to a disposable copy of the extension.
(async () => {
  const checks = [];
  const assert = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function wait(predicate, label) {
    for (let i = 0; i < 600; i++) {
      if (await predicate()) return;
      await sleep(100);
    }
    throw new Error(`Timed out: ${label}`);
  }
  async function frame(page) {
    const element = document.createElement('iframe');
    element.style.width = '375px';
    element.style.height = '800px';
    document.body.append(element);
    const loaded = new Promise((resolve) => { element.onload = resolve; });
    element.src = browser.runtime.getURL(page);
    await loaded;
    await element.contentWindow.Platform.getCapabilities();
    return element;
  }
  async function find(url) {
    return (await VisitStore.query({text: url})).items.find((item) => item.url === url);
  }
  async function report(result) {
    await fetch(SMOKE.origin + '/result', {method: 'POST', body: JSON.stringify(result)});
  }
  try {
    await VisitStore.initialize();
    const marker = SMOKE.origin + '/persisted-marker';
    const pendingUrl = SMOKE.origin + '/pending-marker';
    if (SMOKE.phase === 'resume') {
      await wait(async () => (await find(pendingUrl)) && tracker.status().pending === 0, 'durable queue replay');
      assert((await find(marker))?.visitCount === 1, 'IndexedDB survives Android process restart');
      const recovered = await find(pendingUrl);
      assert(recovered.visitCount === 1, 'pending visit recovers once after Android restart');
      assert(recovered.firstVisit === SMOKE.pendingTimestamp, 'recovered visit keeps its original timestamp');
      await tracker.remove();
      assert((await VisitStore.query()).total === 0, 'clear removes the complete visit log');
      await report({ok: true, checks, firefox: (await browser.runtime.getBrowserInfo()).version});
      return;
    }

    const url = SMOKE.origin + '/fixture?long=' + 'x'.repeat(400);
    const tab = await browser.tabs.create({url});
    await wait(async () => (await find(url))?.title === 'Final smoke title', 'navigation and title');
    assert((await find(url)).visitCount === 1, 'one real navigation is recorded once');
    await browser.tabs.reload(tab.id);
    await wait(async () => (await find(url))?.visitCount === 2, 'reload count');
    await wait(async () => (await find(url))?.title === 'Final smoke title' && tracker.status().pending === 0, 'late reload title');
    assert((await find(url)).title === 'Final smoke title', 'late title is persisted after reload');

    const size = SMOKE.android ? 50 : 200;
    for (let i = 0; i <= size; i++) {
      await VisitStore.record({url: SMOKE.origin + '/seed/' + i, title: 'Seed ' + i}, 1000 + i, 'seed-' + i);
    }
    const visits = await frame('visits.html');
    const vd = visits.contentDocument;
    await wait(() => vd.querySelector('#visits-body a'), 'visit rendering');
    assert(visits.contentWindow.getComputedStyle(vd.querySelector('tbody')).display === 'block', '375px layout uses cards');
    assert(vd.documentElement.scrollWidth <= vd.documentElement.clientWidth, '375px page has no horizontal overflow');
    assert(vd.querySelectorAll('#visits-body a').length === size, 'platform-specific page size is applied');
    vd.getElementById('nextPage').click();
    await wait(() => vd.getElementById('pageInfo').textContent.startsWith('Page 2'), 'next page');
    assert(vd.querySelectorAll('#visits-body a').length === 2, 'pagination shows remaining records');
    const input = vd.getElementById('filterInput');
    input.value = 'Final smoke title';
    input.dispatchEvent(new visits.contentWindow.Event('input'));
    await wait(() => vd.querySelectorAll('#visits-body a').length === 1 && vd.getElementById('pageInfo').textContent.startsWith('Page 1'), 'filtered first page');
    assert(vd.querySelector('#visits-body a').href === url, 'search returns the matching visit');

    const list = await frame('list.html');
    await wait(() => list.contentDocument.querySelector('#tabs-body .title'), 'tab rendering');
    assert(list.contentDocument.querySelectorAll('#tabs-body .title').length >= 1, 'real tabs list renders');
    if (SMOKE.android) {
      assert(list.contentDocument.getElementById('windowHeader').hidden, 'Android hides unsupported window controls');
    }
    const duplicateUrl = SMOKE.origin + '/duplicate';
    await browser.tabs.create({url: duplicateUrl});
    await browser.tabs.create({url: duplicateUrl});
    await wait(async () => (await browser.tabs.query({})).filter(t => t.url === duplicateUrl && t.status === 'complete').length === 2, 'duplicate tabs');
    const popup = await frame('popup.html');
    if (SMOKE.android) assert(popup.contentDocument.getElementById('openHistory').hidden, 'Android hides Firefox History');
    popup.contentDocument.getElementById('closeDuplicates').click();
    await wait(async () => (await browser.tabs.query({})).filter(t => t.url === duplicateUrl).length === 1, 'duplicate removal');
    assert(true, 'duplicate closing works in the actual browser');

    if (SMOKE.android) {
      let downloads;
      browser.runtime.onMessage.addListener(message => { if(message.type === 'smoke-export-result') downloads = message.result; });
      const exportTab = await browser.tabs.create({url:browser.runtime.getURL('smoke-export.html')});
      await wait(() => downloads, 'exports from an extension tab');
      assert(downloads.ok, 'CSV and JSON files download on Android: ' + JSON.stringify(downloads));
      await browser.tabs.remove(exportTab.id);
    }
    await tracker.remove(url);
    assert(!(await find(url)), 'deletion removes the record');
    await browser.tabs.remove(tab.id);
    await tracker.remove();
    if (SMOKE.android) {
      await VisitStore.record({url:marker,title:'Persisted'}, 500, 'persisted');
      const realRecord = VisitStore.record;
      VisitStore.record = (...args) => args[0].url === pendingUrl ? Promise.reject(new Error('Injected transient failure')) : realRecord(...args);
      await tracker.enqueue('record', {url:pendingUrl,title:'Pending'});
      await wait(() => tracker.status().failed, 'injected failure');
      const queue = (await browser.storage.local.get('vt_pending_v1')).vt_pending_v1;
      assert(queue.some(job => job.page.url === pendingUrl), 'pending visit is durably queued before restart');
      const pendingTimestamp = queue.find(job => job.page.url === pendingUrl).timestamp;
      await report({ok:true,checks,pendingTimestamp,firefox:(await browser.runtime.getBrowserInfo()).version});
    } else {
      await report({ok:true,checks,firefox:(await browser.runtime.getBrowserInfo()).version});
    }
  } catch (error) {
    await report({ok:false,checks,error:String(error),stack:error.stack});
  }
})();
