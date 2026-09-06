document.addEventListener("DOMContentLoaded", async () => {
  const openListBtn = document.getElementById("openList");
  const openHistoryBtn = document.getElementById("openHistory");
  const openVisitsBtn = document.getElementById("openVisits");
  const closeDuplicatesBtn = document.getElementById("closeDuplicates");
  const status = document.getElementById("status");
  const capabilities = await Platform.getCapabilities();

  if (capabilities.isAndroid) {
    document.documentElement.classList.add("android");
  }
  if (!capabilities.supportsHistory) {
    openHistoryBtn.hidden = true;
    status.textContent =
      "Firefox History is unavailable on Android. Use Tracked pages.";
  }

  function openPage(page) {
    return browser.tabs.create({ url: browser.runtime.getURL(page) });
  }

  openListBtn.addEventListener("click", () => openPage("list.html"));
  openHistoryBtn.addEventListener("click", () => openPage("history.html"));
  openVisitsBtn.addEventListener("click", () => openPage("visits.html"));

  // Close duplicate tabs, keeping the last occurrence of each URL.
  closeDuplicatesBtn.addEventListener("click", async () => {
    closeDuplicatesBtn.disabled = true;
    status.textContent = "Searching for duplicates...";

    try {
      const tabs = await browser.tabs.query(
        capabilities.isAndroid ? {} : { currentWindow: true },
      );
      tabs.sort((a, b) => a.index - b.index);

      const urlSet = new Set();
      const duplicates = [];

      for (let i = tabs.length - 1; i >= 0; i--) {
        const tab = tabs[i];
        if (
          !tab.url ||
          tab.incognito ||
          tab.pinned ||
          tab.url.startsWith("about:") ||
          tab.url.startsWith("chrome://")
        ) {
          continue;
        }

        // Unknown desktop identities must never be merged. Android does not
        // have containers; all its regular tabs share the default store.
        const identity = tab.cookieStoreId ||
          (capabilities.isAndroid ? "default" : `unknown-${tab.id}`);
        const key = JSON.stringify([identity, tab.url]);
        if (urlSet.has(key)) {
          duplicates.push(tab.id);
        } else {
          urlSet.add(key);
        }
      }

      if (duplicates.length === 0) {
        status.textContent = "✅ No duplicate pages!";
      } else {
        await browser.tabs.remove(duplicates);
        status.textContent = `✅ Closed: ${duplicates.length} duplicate pages`;
      }
    } catch (error) {
      console.error(error);
      status.textContent = "❌ Error";
    } finally {
      closeDuplicatesBtn.disabled = false;
    }
  });
});
