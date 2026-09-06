// background.js — visit tracker service.
//
// Firefox's own history API is limited (and history.search defaults to the last
// 24h), so we maintain our own IndexedDB log through VisitStore. This runs on
// the persistent MV2 background page; storage.js is loaded before this script.

function shouldTrack(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

// Tracks the current navigation, including writes still in flight. A "loading"
// event clears the value so an explicit reload counts as another visit.
const lastRecorded = new Map(); // tabId -> url

const tracker = VisitTracker.create({
  store: VisitStore,
  storage: browser.storage.local,
  onChange: async (status) => {
    try {
      if (browser.browserAction && browser.browserAction.setBadgeText) {
        await browser.browserAction.setBadgeText({ text: status.failed ? "!" : "" });
        await browser.browserAction.setBadgeBackgroundColor({ color: "#b42318" });
      }
    } catch (_error) {
      // Badge APIs are optional on mobile; the in-page status must still update.
    }
    await notifyVisitStoreChanged();
  },
});

function notifyVisitStoreChanged() {
  return browser.runtime
    .sendMessage({ type: "visit-store-changed" })
    .catch(() => {});
}

async function handleUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status === "loading") {
    lastRecorded.delete(tabId);
    return;
  }
  const url = tab && tab.url;
  if (!tab || tab.incognito || !shouldTrack(url)) return;
  if (changeInfo.title && lastRecorded.get(tabId) === url) {
    await tracker.enqueue("title", { url, title: tab.title }).catch(console.error);
  }
  if (changeInfo.status !== "complete") return;
  if (lastRecorded.get(tabId) === url) return;

  lastRecorded.set(tabId, url);
  try {
    await tracker.enqueue("record", { url, title: tab.title });
  } catch (err) {
    if (lastRecorded.get(tabId) === url) {
      lastRecorded.delete(tabId);
    }
    console.error("VisitStore.record failed:", err);
  }
}

function handleRemoved(tabId) {
  lastRecorded.delete(tabId);
}

browser.tabs.onUpdated.addListener(handleUpdated);
browser.tabs.onRemoved.addListener(handleRemoved);
tracker.start();

// Initialize migration eagerly. Each store operation retries initialization if
// this first attempt fails.
VisitStore.initialize().catch((error) => {
  console.error("VisitStore initialization failed:", error);
});

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "visit-store") return undefined;

  switch (message.action) {
    case "query":
      return VisitStore.query(message.options);
    case "getAll":
      return VisitStore.getAll(message.text);
    case "remove":
      if (typeof message.url !== "string") return Promise.reject(new Error("URL required"));
      return tracker.remove(message.url);
    case "clear":
      return tracker.remove();
    case "status":
      return Promise.resolve(tracker.status());
    case "retry":
      return tracker.retry();
    default:
      return Promise.reject(
        new Error(`Unknown VisitStore action: ${message.action}`),
      );
  }
});
