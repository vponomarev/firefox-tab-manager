const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { source, event } = require("./helpers.cjs");
test("background counts navigation and reload once, updates late titles and excludes private pages", async () => {
  const calls = [];
  const onUpdated = event();
  const t = {
    enqueue: async (...args) => calls.push(args),
    start() {},
    status: () => ({}),
  };
  vm.runInNewContext(source("background.js"), {
    URL,
    console,
    VisitStore: { initialize: async () => {} },
    VisitTracker: { create: () => t },
    browser: {
      storage: { local: {} },
      tabs: { onUpdated, onRemoved: event() },
      runtime: { onMessage: event(), sendMessage: async () => {} },
    },
  });
  const tab = {
    url: "https://example.com",
    title: "Loading",
    incognito: false,
  };
  await onUpdated.emit(1, { status: "complete" }, tab);
  await onUpdated.emit(1, { status: "complete" }, tab);
  await onUpdated.emit(1, { title: "Report" }, { ...tab, title: "Report" });
  await onUpdated.emit(1, { status: "loading" }, tab);
  await onUpdated.emit(1, { status: "complete" }, tab);
  await onUpdated.emit(2, { status: "complete" }, { ...tab, incognito: true });
  await onUpdated.emit(3, { status: "complete" }, { url: "about:config" });
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["record", "title", "record"],
  );
  assert.equal(calls[1][1].title, "Report");
});

test('missing or unsupported mobile badge APIs never suppress status updates', async () => {
  for (const action of [undefined, {setBadgeText: async () => { throw Error('unsupported'); }}]) {
    let onChange;
    let sent = 0;
    vm.runInNewContext(source('background.js'), {
      URL, console, VisitStore: {initialize: async () => {}},
      VisitTracker: {create: options => {onChange = options.onChange; return {start() {}};}},
      browser: {
        browserAction: action, storage: {local: {}},
        tabs: {onUpdated: event(), onRemoved: event()},
        runtime: {onMessage: event(), sendMessage: async () => sent++}
      }
    });
    await onChange({failed: true});
    assert.equal(sent, 1);
  }
});
