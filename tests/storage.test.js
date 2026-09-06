const test = require("node:test");
const assert = require("node:assert/strict");
const { store } = require("./helpers.cjs");
test("replayed operations do not increment counts; real reloads do", async () => {
  const { store: s } = store();
  await s.record({ url: "https://example.com", title: "Initial" }, 100, "one");
  await s.record({ url: "https://example.com", title: "Initial" }, 100, "one");
  await s.record({ url: "https://example.com", title: "Reload" }, 200, "two");
  const page = await s.query();
  assert.equal(page.total, 1);
  assert.equal(page.items[0].visitCount, 2);
  assert.equal(page.items[0].firstVisit, 100);
  assert.equal(page.items[0].lastVisit, 200);
});
test("late titles are searchable without changing counters or resurrecting deleted pages", async () => {
  const { store: s } = store();
  await s.record({ url: "https://example.com", title: "Loading" }, 100, "one");
  await s.updateTitle({
    url: "https://example.com",
    title: "Quarterly report",
  });
  const { items } = await s.query({ text: "quarterly" });
  assert.equal(items.length, 1);
  assert.equal(items[0].visitCount, 1);
  assert.equal(items[0].lastVisit, 100);
  await s.remove("https://example.com");
  await s.updateTitle({ url: "https://example.com", title: "Late" });
  assert.equal((await s.query()).total, 0);
});
test("concurrent writes preserve all visits", async () => {
  const { store: s } = store();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      s.record({ url: "https://example.com" }, 100 + i, String(i)),
    ),
  );
  assert.equal((await s.query()).items[0].visitCount, 20);
});
test("migration and subsequent visits preserve more than 50000 pages", async () => {
  const legacy = {};
  for (let i = 0; i < 50000; i++)
    legacy[i] = {
      url: "https://example.com/" + i,
      title: "Page " + i,
      firstVisit: i + 1,
      lastVisit: i + 1,
      visitCount: 1,
    };
  const { store: s, storage } = store({ vt_visits_v1: legacy });
  await s.initialize();
  assert.equal(storage.snapshot().vt_visits_v1, undefined);
  await s.record(
    { url: "https://example.com/new", title: "New" },
    60000,
    "new",
  );
  assert.equal((await s.query()).total, 50001);
  const oldest = await s.query({ offset: 50000, limit: 1 });
  assert.equal(oldest.items[0].url, "https://example.com/0");
});
