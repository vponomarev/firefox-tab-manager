document.addEventListener("DOMContentLoaded", () => {
  const openListBtn = document.getElementById("openList");
  const openHistoryBtn = document.getElementById("openHistory");
  const openVisitsBtn = document.getElementById("openVisits");
  const closeDuplicatesBtn = document.getElementById("closeDuplicates");
  const status = document.getElementById("status");

  function openPage(page) {
    browser.tabs.create({ url: browser.runtime.getURL(page) });
  }

  openListBtn.addEventListener("click", () => openPage("list.html"));
  openHistoryBtn.addEventListener("click", () => openPage("history.html"));
  openVisitsBtn.addEventListener("click", () => openPage("visits.html"));

  // Close duplicate tabs, keeping the last occurrence of each URL.
  closeDuplicatesBtn.addEventListener("click", async () => {
    status.textContent = "Searching for duplicates...";

    try {
      const tabs = await browser.tabs.query({ currentWindow: true });
      tabs.sort((a, b) => a.index - b.index);

      const urlSet = new Set();
      const duplicates = [];

      for (let i = tabs.length - 1; i >= 0; i--) {
        const tab = tabs[i];
        if (
          !tab.url ||
          tab.pinned ||
          tab.url.startsWith("about:") ||
          tab.url.startsWith("chrome://")
        ) {
          continue;
        }

        if (urlSet.has(tab.url)) {
          duplicates.push(tab.id);
        } else {
          urlSet.add(tab.url);
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
    }
  });
});
