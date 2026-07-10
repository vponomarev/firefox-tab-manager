document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("tabs-body");
  const filterInput = document.getElementById("filterInput");
  const countInfo = document.getElementById("countInfo");
  const exportCsvBtn = document.getElementById("exportCsv");
  const exportJsonBtn = document.getElementById("exportJson");

  let allTabs = [];
  let filteredTabs = [];
  let windowMap = new Map();

  // Load windows + tabs and render. Called on init and whenever tabs change.
  async function reload() {
    const windows = await browser.windows.getAll();
    windowMap = new Map(
      windows.map((win) => [win.id, win.incognito ? "Private" : "Common"]),
    );

    allTabs = await browser.tabs.query({});
    allTabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index);

    applyFilter();
  }

  function showError(message) {
    tbody.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "empty";
    td.textContent = `Error: ${message}`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  // === RENDER ===
  function renderTable(tabs) {
    tbody.replaceChildren();
    if (tabs.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.className = "empty";
      td.textContent = "No match found";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    tabs.forEach((tab) => {
      const tr = document.createElement("tr");

      // Title
      const tdTitle = document.createElement("td");
      let title = tab.title || "(no title)";
      if (title.length > 450) title = title.substring(0, 450) + "…";
      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = title;
      titleSpan.title = tab.title || "";
      titleSpan.style.cursor = "pointer";
      titleSpan.addEventListener("click", () => {
        browser.tabs.update(tab.id, { active: true });
        browser.windows.update(tab.windowId, { focused: true });
      });
      tdTitle.appendChild(titleSpan);

      // URL
      const tdUrl = document.createElement("td");
      let url = tab.url || "";
      if (url.length > 450) url = url.substring(0, 450) + "…";
      const urlSpan = document.createElement("span");
      urlSpan.className = "url";
      urlSpan.textContent = url;
      urlSpan.title = tab.url || "";
      tdUrl.appendChild(urlSpan);

      // Window
      const tdWindow = document.createElement("td");
      tdWindow.className = "window";
      const windowType = windowMap.get(tab.windowId) || "Unknown";
      tdWindow.textContent = `Window ${tab.windowId} (${windowType})`;

      // Close button
      const tdAction = document.createElement("td");
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "Close";
      closeBtn.className = "close-btn";
      closeBtn.addEventListener("click", async () => {
        try {
          await browser.tabs.remove(tab.id);
          // onRemoved listener will reload the list and refresh the count.
        } catch (err) {
          console.error("Error closing:", err);
          alert("Unable to close tab");
        }
      });
      tdAction.appendChild(closeBtn);

      tr.appendChild(tdTitle);
      tr.appendChild(tdUrl);
      tr.appendChild(tdWindow);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    });
  }

  // === COUNT ===
  function updateCount() {
    countInfo.textContent = `Shown: ${filteredTabs.length} / Total: ${allTabs.length}`;
  }

  // === FILTER ===
  function applyFilter() {
    const query = filterInput.value.toLowerCase().trim();
    if (!query) {
      filteredTabs = allTabs;
    } else {
      filteredTabs = allTabs.filter((tab) => {
        const title = (tab.title || "").toLowerCase();
        const url = (tab.url || "").toLowerCase();
        return title.includes(query) || url.includes(query);
      });
    }
    renderTable(filteredTabs);
    updateCount();
  }

  filterInput.addEventListener("input", applyFilter);

  // Live updates: keep the list in sync as tabs open/close/navigate.
  const scheduleReload = (() => {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      setTimeout(async () => {
        pending = false;
        try {
          await reload();
        } catch (err) {
          console.error("Error refreshing tabs:", err);
        }
      }, 150);
    };
  })();

  browser.tabs.onCreated.addListener(scheduleReload);
  browser.tabs.onRemoved.addListener(scheduleReload);
  browser.tabs.onUpdated.addListener(scheduleReload);
  browser.tabs.onMoved.addListener(scheduleReload);

  // === EXPORT ===
  exportCsvBtn.addEventListener("click", () => {
    const rows = filteredTabs.map((tab) => [
      tab.title || "",
      tab.url || "",
      tab.windowId,
      windowMap.get(tab.windowId) || "Unknown",
      tab.index,
    ]);
    ExportUtils.exportCsv(
      `tabs_${ExportUtils.dateStamp()}.csv`,
      ["Title", "URL", "Window ID", "Window type", "Index"],
      rows,
    );
  });

  exportJsonBtn.addEventListener("click", () => {
    const data = filteredTabs.map((tab) => ({
      title: tab.title,
      url: tab.url,
      windowId: tab.windowId,
      windowType: windowMap.get(tab.windowId) || "unknown",
      index: tab.index,
      active: tab.active,
      pinned: tab.pinned,
    }));
    ExportUtils.exportJson(`tabs_${ExportUtils.dateStamp()}.json`, data);
  });

  // Initial load
  try {
    await reload();
  } catch (error) {
    console.error("Error loading tabs:", error);
    showError(error.message);
  }
});
