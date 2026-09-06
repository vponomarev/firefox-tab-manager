// Shared runtime capability detection for desktop Firefox and Firefox Android.
(function (global) {
  "use strict";

  let capabilitiesPromise;

  function hasMethod(namespace, method) {
    return Boolean(namespace && typeof namespace[method] === "function");
  }

  async function detectCapabilities(browserApi) {
    let os = "unknown";
    try {
      const platformInfo = await browserApi.runtime.getPlatformInfo();
      os = platformInfo.os || os;
    } catch (_error) {
      // API presence checks below remain a safe fallback.
    }

    const isAndroid = os === "android";
    return Object.freeze({
      os,
      isAndroid,
      supportsHistory:
        !isAndroid && hasMethod(browserApi.history, "search"),
      supportsWindows:
        !isAndroid &&
        hasMethod(browserApi.windows, "getAll") &&
        hasMethod(browserApi.windows, "update"),
    });
  }

  function getCapabilities() {
    if (!capabilitiesPromise) {
      capabilitiesPromise = detectCapabilities(browser);
    }
    return capabilitiesPromise;
  }

  global.Platform = { detectCapabilities, getCapabilities };
})(this);
