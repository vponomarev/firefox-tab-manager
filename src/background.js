// background.js — visit tracker service.
//
// Firefox's own history API is limited (and history.search defaults to the last
// 24h), so we maintain our own log of visited pages in browser.storage.local via
// VisitStore. This runs on the persistent MV2 background page; storage.js is
// loaded before this script (see manifest "background.scripts").

// URLs we never want to record.
const IGNORED_PREFIXES = [
  "about:",
  "chrome://",
  "moz-extension://",
  "resource://",
  "view-source:",
  "data:",
  "file://",
];

function shouldTrack(url) {
  if (!url) return false;
  return !IGNORED_PREFIXES.some((p) => url.startsWith(p));
}

// Debounce identical consecutive hits per tab. tabs.onUpdated can fire "complete"
// more than once for the same navigation (e.g. late title updates), which would
// otherwise inflate visitCount.
const lastRecorded = new Map(); // tabId -> url

async function handleUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status !== "complete") return;
  const url = tab && tab.url;
  if (!shouldTrack(url)) return;
  if (lastRecorded.get(tabId) === url) return;

  lastRecorded.set(tabId, url);
  try {
    await VisitStore.record({ url, title: tab.title });
  } catch (err) {
    console.error("VisitStore.record failed:", err);
  }
}

function handleRemoved(tabId) {
  lastRecorded.delete(tabId);
}

browser.tabs.onUpdated.addListener(handleUpdated);
browser.tabs.onRemoved.addListener(handleRemoved);
