// storage.js — persistent store of visited pages, backed by browser.storage.local.
//
// This is the foundation for local search and future cross-device sync. Records
// are keyed by URL and carry timestamps + a visit counter, so a later sync layer
// can merge two devices with last-write-wins on `lastVisit`.
//
// Loaded via <script> before the page script (and listed in the background page);
// exposes a global `VisitStore`. Each page/context gets its own copy of these
// helpers — the single source of truth is browser.storage.local.
(function (global) {
  "use strict";

  const STORAGE_KEY = "vt_visits_v1"; // bump suffix on breaking schema changes
  const MAX_ENTRIES = 50000; // safety cap; oldest visits are dropped past this

  // Writes are serialized through this chain so concurrent record() calls from
  // rapid navigation don't clobber each other (read-modify-write races).
  let writeChain = Promise.resolve();

  async function readMap() {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] || {};
  }

  function writeMap(map) {
    return browser.storage.local.set({ [STORAGE_KEY]: map });
  }

  // Enqueue a mutation of the map. `mutator(map)` may mutate in place.
  function mutate(mutator) {
    writeChain = writeChain.then(async () => {
      const map = await readMap();
      mutator(map);
      await writeMap(map);
    });
    return writeChain;
  }

  // Upsert a visit. `now` is injectable for testing; defaults to Date.now().
  function record({ url, title }, now) {
    if (!url) return Promise.resolve();
    const ts = now == null ? Date.now() : now;
    return mutate((map) => {
      const existing = map[url];
      if (existing) {
        existing.lastVisit = ts;
        existing.visitCount = (existing.visitCount || 0) + 1;
        // Keep the latest non-empty title.
        if (title) existing.title = title;
      } else {
        map[url] = {
          url,
          title: title || "",
          firstVisit: ts,
          lastVisit: ts,
          visitCount: 1,
        };
      }
      enforceCap(map);
    });
  }

  // Drop the oldest entries (by lastVisit) if we exceed the cap.
  function enforceCap(map) {
    const keys = Object.keys(map);
    if (keys.length <= MAX_ENTRIES) return;
    keys
      .sort((a, b) => map[a].lastVisit - map[b].lastVisit)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete map[k]);
  }

  // Return all visits as an array (unsorted).
  async function getAll() {
    const map = await readMap();
    return Object.values(map);
  }

  function remove(url) {
    return mutate((map) => {
      delete map[url];
    });
  }

  function clear() {
    return browser.storage.local.remove(STORAGE_KEY);
  }

  global.VisitStore = { record, getAll, remove, clear, STORAGE_KEY };
})(this);
