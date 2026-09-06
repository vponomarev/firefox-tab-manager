const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { source, event, until } = require("./helpers.cjs");
async function page(
  html,
  scripts,
  browser,
  capabilities = {
    isAndroid: false,
    supportsHistory: true,
    supportsWindows: true,
  },
) {
  const dom = new JSDOM(source(html), {
    runScripts: "outside-only",
    url: "https://extension.example/" + html,
  });
  await new Promise((r) =>
    dom.window.addEventListener("load", r, { once: true }),
  );
  dom.window.browser = browser;
  dom.window.Platform = { getCapabilities: async () => capabilities };
  dom.window.ExportUtils = {
    exportCsv() {},
    exportJson() {},
    dateStamp: () => "2026-09-06",
  };
  dom.window.alert = () => {};
  for (const script of scripts) dom.window.eval(source(script));
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((r) => setImmediate(r));
  return dom;
}
test("desktop duplicates are scoped to container; pinned, private and unknown identities survive", async () => {
  const tabs = [
    { id: 1, index: 0, cookieStoreId: "work" },
    { id: 2, index: 1, cookieStoreId: "personal" },
    { id: 3, index: 2, cookieStoreId: "work" },
    { id: 4, index: 3, cookieStoreId: "work", pinned: true },
    { id: 5, index: 4 },
    { id: 6, index: 5 },
    { id: 7, index: 6, incognito: true, cookieStoreId: "work" },
  ].map((t) => ({ ...t, url: "https://example.com/" }));
  let removed;
  const dom = await page("popup.html", ["popup.js"], {
    tabs: {
      query: async () => tabs,
      remove: async (ids) => (removed = Array.from(ids)),
    },
  });
  dom.window.document.getElementById("closeDuplicates").click();
  await until(() => removed);
  assert.deepEqual(removed, [1]);
  dom.window.close();
});
test("Android popup hides Firefox history and closes default-store duplicates across tabs", async () => {
  let query, removed;
  const dom = await page(
    "popup.html",
    ["popup.js"],
    {
      tabs: {
        query: async (q) => {
          query = q;
          return [
            { id: 1, index: 0, url: "https://example.com/" },
            { id: 2, index: 0, url: "https://example.com/" },
          ];
        },
        remove: async (ids) => (removed = Array.from(ids)),
      },
    },
    { isAndroid: true, supportsHistory: false, supportsWindows: false },
  );
  assert.equal(dom.window.document.getElementById("openHistory").hidden, true);
  dom.window.document.getElementById("closeDuplicates").click();
  await until(() => removed);
  assert.deepEqual(Object.keys(query), []);
  assert.deepEqual(removed, [1]);
  dom.window.close();
});
function tabEvents() {
  return Object.fromEntries(
    [
      "onCreated",
      "onRemoved",
      "onUpdated",
      "onMoved",
      "onAttached",
      "onDetached",
      "onActivated",
    ].map((k) => [k, event()]),
  );
}
test("tab activation focuses the returned current window after a move", async () => {
  let focused;
  const events = tabEvents();
  const dom = await page("list.html", ["list.js"], {
    tabs: {
      ...events,
      query: async () => [
        {
          id: 1,
          index: 0,
          url: "https://example.com",
          title: "Example",
          windowId: 10,
        },
      ],
      update: async () => ({ windowId: 20 }),
    },
    windows: {
      getAll: async () => [{ id: 10 }],
      update: async (id) => (focused = id),
    },
  });
  assert.equal(events.onAttached.listeners.length, 1);
  assert.equal(events.onDetached.listeners.length, 1);
  dom.window.document.querySelector(".title").click();
  await until(() => focused);
  assert.equal(focused, 20);
  dom.window.close();
});
test("Android tabs render, focus and export without windows or history APIs", async () => {
  let activated, exported;
  const dom = await page(
    "list.html",
    ["list.js"],
    {
      tabs: {
        ...tabEvents(),
        query: async () => [
          { id: 1, index: 0, url: "https://example.com", title: "Example" },
        ],
        update: async (id) => {
          activated = id;
          return { id };
        },
      },
    },
    { isAndroid: true, supportsHistory: false, supportsWindows: false },
  );
  assert.equal(dom.window.document.getElementById("windowHeader").hidden, true);
  assert.equal(dom.window.document.querySelectorAll("#tabs-body td").length, 3);
  dom.window.document.querySelector(".title").click();
  await until(() => activated);
  dom.window.ExportUtils.exportJson = (_filename, data) => (exported = data);
  dom.window.document.getElementById("exportJson").click();
  assert.equal(exported[0].url, "https://example.com");
  assert.equal(exported[0].windowId, undefined);
  dom.window.close();
});
test("Android tracked pages request 50 rows and offer export of all matching pages", async () => {
  const calls = [];
  const dom = await page(
    "visits.html",
    ["visits.js"],
    {
      runtime: {
        onMessage: event(),
        sendMessage: async (message) => {
          calls.push(message);
          return message.action === "query" ? { items: [], total: 0 } : [];
        },
      },
    },
    { isAndroid: true, supportsHistory: false, supportsWindows: false },
  );
  assert.equal(calls[0].options.limit, 50);
  dom.window.document.getElementById("exportJson").click();
  await until(() => calls.length > 1);
  assert.equal(calls[1].action, "getAll");
  dom.window.close();
});
test("saving errors are visible and the retry button resumes the queue", async () => {
  let failed = true;
  const dom = await page("popup.html", ["tracking-status.js"], {
    runtime: {
      onMessage: event(),
      sendMessage: async (message) => {
        if (message.action === "retry") failed = false;
        return { pending: failed ? 1 : 0, failed, paused: failed };
      },
    },
  });
  const panel = dom.window.document.getElementById("trackingStatus");
  assert.equal(panel.hidden, false);
  dom.window.document.getElementById("retryTracking").click();
  await until(() => panel.hidden);
  dom.window.close();
});
