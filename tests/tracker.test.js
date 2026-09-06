const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { source, memoryStorage, store, until } = require("./helpers.cjs");
function tracker(s, storage = memoryStorage()) {
  const context = { console: { error() {} }, setTimeout, clearTimeout };
  vm.runInNewContext(source("tracker.js"), context);
  const timers = new Map();
  let id = 0;
  const statuses = [];
  const t = context.VisitTracker.create({
    store: s,
    storage,
    onChange: (s) => statuses.push(s),
    now: () => 100,
    createId: () => String(++id),
    setTimer: (f) => {
      const n = ++id;
      timers.set(n, f);
      return n;
    },
    clearTimer: (n) => timers.delete(n),
  });
  return {
    t,
    storage,
    timers,
    statuses,
    fire() {
      const [n, f] = timers.entries().next().value;
      timers.delete(n);
      f();
    },
  };
}
test("temporary write errors retry with original timestamps", async () => {
  const calls = [];
  let fail = true;
  const { t, fire, timers } = tracker({
    record: async (...args) => {
      if (fail) throw Error("disk");
      calls.push(args);
    },
  });
  await t.enqueue("record", { url: "https://example.com", title: "Page" });
  await until(() => timers.size === 1);
  assert.equal(t.status().pending, 1);
  assert.equal(t.status().failed, true);
  fail = false;
  fire();
  await until(() => t.status().pending === 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 100);
});
test("failed startup queue read retains the incoming visit", async () => {
  const storage = memoryStorage();
  const get = storage.get;
  let fail = true;
  storage.get = async (k) => {
    if (fail) throw Error("read");
    return get(k);
  };
  let count = 0;
  const { t, fire, timers } = tracker({ record: async () => count++ }, storage);
  await t.enqueue("record", { url: "https://example.com" });
  await until(() => timers.size === 1);
  fail = false;
  fire();
  await until(() => count === 1 && t.status().pending === 0);
});
test("retries pause after three delays and can be resumed manually", async () => {
  let fail = true;
  const { t, fire, timers } = tracker({
    record: async () => {
      if (fail) throw Error("disk");
    },
  });
  await t.enqueue("record", { url: "https://example.com" });
  for (let i = 0; i < 3; i++) {
    await until(() => timers.size === 1);
    fire();
  }
  await until(() => t.status().paused);
  assert.equal(t.status().pending, 1);
  assert.equal(timers.size, 0);
  fail = false;
  await t.retry();
  assert.equal(t.status().pending, 0);
  assert.equal(t.status().failed, false);
});
test("persisted queue replays safely after successful DB write but failed acknowledgement", async () => {
  const { store: s } = store();
  const storage = memoryStorage();
  const set = storage.set;
  let rejectEmpty = true;
  storage.set = async (value) => {
    if (rejectEmpty && value.vt_pending_v1.length === 0) throw Error("ack");
    return set(value);
  };
  const first = tracker(s, storage);
  await first.t.enqueue("record", { url: "https://example.com" });
  await until(() => first.timers.size === 1);
  assert.equal((await s.query()).items[0].visitCount, 1);
  rejectEmpty = false;
  const restarted = tracker(s, storage);
  await restarted.t.start();
  assert.equal((await s.query()).items[0].visitCount, 1);
  assert.equal(restarted.t.status().pending, 0);
});
test("deleting a page cancels failed writes so retry cannot resurrect it", async () => {
  const { store: s } = store();
  const record = s.record;
  let fail = true;
  s.record = async (...args) => {
    if (fail) throw Error("disk");
    return record(...args);
  };
  const { t, timers } = tracker(s);
  await t.enqueue("record", { url: "https://example.com" });
  await until(() => timers.size === 1);
  await t.remove("https://example.com");
  fail = false;
  await t.retry();
  assert.equal((await s.query()).total, 0);
});
test("clear waits for in-flight writes before deleting", async () => {
  const { store: s } = store();
  const record = s.record;
  let release;
  let entered = false;
  s.record = async (...args) => {
    entered = true;
    await new Promise((r) => (release = r));
    return record(...args);
  };
  const { t } = tracker(s);
  await t.enqueue("record", { url: "https://example.com" });
  await until(() => entered);
  const clearing = t.remove();
  release();
  await clearing;
  assert.equal((await s.query()).total, 0);
  assert.equal(t.status().pending, 0);
});
