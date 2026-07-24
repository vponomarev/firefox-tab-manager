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
  if (changeInfo.status !== "complete") return;
  const url = tab && tab.url;
  if (!tab || tab.incognito || !shouldTrack(url)) return;
  if (lastRecorded.get(tabId) === url) return;

  lastRecorded.set(tabId, url);
  try {
    await VisitStore.record({ url, title: tab.title });
    await notifyVisitStoreChanged();
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
      return VisitStore.remove(message.url).then(notifyVisitStoreChanged);
    case "clear":
      return VisitStore.clear().then(notifyVisitStoreChanged);
    default:
      return Promise.reject(
        new Error(`Unknown VisitStore action: ${message.action}`),
      );
  }
});
