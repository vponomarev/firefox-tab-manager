"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "platform.js"),
  "utf8",
);
const context = {};
vm.createContext(context);
vm.runInContext(source, context);

function mockBrowser(os, { history = true, windows = true } = {}) {
  return {
    runtime: {
      getPlatformInfo: async () => ({ os }),
    },
    history: history ? { search() {} } : undefined,
    windows: windows ? { getAll() {}, update() {} } : undefined,
  };
}

test("Android disables unsupported history and windows APIs", async () => {
  const capabilities = await context.Platform.detectCapabilities(
    mockBrowser("android"),
  );
  assert.equal(capabilities.isAndroid, true);
  assert.equal(capabilities.supportsHistory, false);
  assert.equal(capabilities.supportsWindows, false);
});

test("desktop enables APIs that are present", async () => {
  const capabilities = await context.Platform.detectCapabilities(
    mockBrowser("win"),
  );
  assert.equal(capabilities.isAndroid, false);
  assert.equal(capabilities.supportsHistory, true);
  assert.equal(capabilities.supportsWindows, true);
});

test("desktop gracefully handles missing optional APIs", async () => {
  const capabilities = await context.Platform.detectCapabilities(
    mockBrowser("linux", { history: false, windows: false }),
  );
  assert.equal(capabilities.supportsHistory, false);
  assert.equal(capabilities.supportsWindows, false);
});
