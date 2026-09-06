const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const source = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");
function memoryStorage(initial = {}) {
  let data = structuredClone(initial);
  return {
    async get(key) {
      return structuredClone({ [key]: data[key] });
    },
    async set(value) {
      Object.assign(data, structuredClone(value));
    },
    async remove(key) {
      delete data[key];
    },
    snapshot() {
      return structuredClone(data);
    },
  };
}
function store(initial) {
  const storage = memoryStorage(initial);
  const context = {
    indexedDB: new IDBFactory(),
    browser: { storage: { local: storage } },
    console,
  };
  vm.runInNewContext(source("storage.js"), context);
  return { store: context.VisitStore, storage };
}
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(predicate(), "Condition did not settle");
}
function event() {
  const listeners = [];
  return {
    listeners,
    addListener: (f) => listeners.push(f),
    emit(...args) {
      return Promise.all(listeners.map((f) => f(...args)));
    },
  };
}
module.exports = { source, memoryStorage, store, until, event };
