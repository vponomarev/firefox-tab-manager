document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("tabs-body");
  const filterInput = document.getElementById("filterInput");
  const countInfo = document.getElementById("countInfo");
  const windowHeader = document.getElementById("windowHeader");
  const exportCsvBtn = document.getElementById("exportCsv");
  const exportJsonBtn = document.getElementById("exportJson");
  const capabilities = await Platform.getCapabilities();
  const columnCount = capabilities.supportsWindows ? 4 : 3;

  if (capabilities.isAndroid) {
    document.documentElement.classList.add("android");
  }
  windowHeader.hidden = !capabilities.supportsWindows;

  let allTabs = [];
  let filteredTabs = [];
  let windowMap = new Map();
  let reloadGeneration = 0;

  async function reload() {
    const generation = ++reloadGeneration;
    let nextWindowMap = new Map();
    if (capabilities.supportsWindows) {
      const windows = await browser.windows.getAll();
      nextWindowMap = new Map(
        windows.map((win) => [win.id, win.incognito ? "Private" : "Common"]),
      );
    }

    const tabs = await browser.tabs.query({});
    if (generation !== reloadGeneration) return;
    windowMap = nextWindowMap;
    allTabs = tabs;
    allTabs.sort((a, b) => {
      if (capabilities.supportsWindows && a.windowId !== b.windowId) {
        return a.windowId - b.windowId;
      }
      return a.index - b.index;
    });
    applyFilter();
  }

  function showMessage(message) {
    tbody.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columnCount;
    cell.className = "empty";
    cell.textContent = message;
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  function renderTable(tabs) {
    tbody.replaceChildren();
    if (tabs.length === 0) {
      showMessage("No match found");
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const tab of tabs) {
      const row = document.createElement("tr");

      const titleCell = document.createElement("td");
      titleCell.dataset.label = "Title";
      let title = tab.title || "(no title)";
      if (title.length > 450) title = `${title.substring(0, 450)}…`;
      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = title;
      titleSpan.title = tab.title || "";
      titleSpan.tabIndex = 0;
      titleSpan.setAttribute("role", "button");

      const activateTab = async () => {
        try {
          const activeTab = await browser.tabs.update(tab.id, { active: true });
          if (capabilities.supportsWindows) {
            await browser.windows.update(activeTab.windowId, { focused: true });
          }
        } catch (error) {
          console.error("Error activating tab:", error);
        }
      };
      titleSpan.addEventListener("click", activateTab);
      titleSpan.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateTab();
        }
      });
      titleCell.appendChild(titleSpan);

      const urlCell = document.createElement("td");
      urlCell.dataset.label = "URL";
      let url = tab.url || "";
      if (url.length > 450) url = `${url.substring(0, 450)}…`;
      const urlSpan = document.createElement("span");
      urlSpan.className = "url";
      urlSpan.textContent = url;
      urlSpan.title = tab.url || "";
      urlCell.appendChild(urlSpan);

      row.appendChild(titleCell);
      row.appendChild(urlCell);

      if (capabilities.supportsWindows) {
        const windowCell = document.createElement("td");
        windowCell.dataset.label = "Window";
        windowCell.className = "window";
        const windowType = windowMap.get(tab.windowId) || "Unknown";
        windowCell.textContent = `Window ${tab.windowId} (${windowType})`;
        row.appendChild(windowCell);
      }

      const actionCell = document.createElement("td");
      actionCell.dataset.label = "Action";
      const closeButton = document.createElement("button");
      closeButton.textContent = "Close";
      closeButton.className = "close-btn";
      closeButton.addEventListener("click", async () => {
        closeButton.disabled = true;
        try {
          await browser.tabs.remove(tab.id);
        } catch (error) {
          closeButton.disabled = false;
          console.error("Error closing tab:", error);
          alert("Unable to close tab");
        }
      });
      actionCell.appendChild(closeButton);
      row.appendChild(actionCell);
      fragment.appendChild(row);
    }
    tbody.appendChild(fragment);
  }

  function updateCount() {
    countInfo.textContent = `Shown: ${filteredTabs.length} / Total: ${allTabs.length}`;
  }

  function applyFilter() {
    const query = filterInput.value.toLocaleLowerCase().trim();
    filteredTabs = query
      ? allTabs.filter((tab) => {
          const title = (tab.title || "").toLocaleLowerCase();
          const url = (tab.url || "").toLocaleLowerCase();
          return title.includes(query) || url.includes(query);
        })
      : allTabs;
    renderTable(filteredTabs);
    updateCount();
  }

  filterInput.addEventListener("input", applyFilter);

  const scheduleReload = (() => {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      setTimeout(async () => {
        pending = false;
        try {
          await reload();
        } catch (error) {
          console.error("Error refreshing tabs:", error);
        }
      }, 150);
    };
  })();

  for (const event of [
    browser.tabs.onCreated,
    browser.tabs.onRemoved,
    browser.tabs.onUpdated,
    browser.tabs.onMoved,
    browser.tabs.onAttached,
    browser.tabs.onDetached,
    browser.tabs.onActivated,
  ]) {
    if (event && typeof event.addListener === "function") {
      event.addListener(scheduleReload);
    }
  }

  exportCsvBtn.addEventListener("click", () => {
    const headers = capabilities.supportsWindows
      ? ["Title", "URL", "Window ID", "Window type", "Index"]
      : ["Title", "URL", "Index"];
    const rows = filteredTabs.map((tab) =>
      capabilities.supportsWindows
        ? [
            tab.title || "",
            tab.url || "",
            tab.windowId,
            windowMap.get(tab.windowId) || "Unknown",
            tab.index,
          ]
        : [tab.title || "", tab.url || "", tab.index],
    );
    ExportUtils.exportCsv(
      `tabs_${ExportUtils.dateStamp()}.csv`,
      headers,
      rows,
    );
  });

  exportJsonBtn.addEventListener("click", () => {
    const data = filteredTabs.map((tab) => {
      const common = {
        title: tab.title,
        url: tab.url,
        index: tab.index,
        active: tab.active,
        pinned: tab.pinned,
      };
      if (!capabilities.supportsWindows) return common;
      return {
        ...common,
        windowId: tab.windowId,
        windowType: windowMap.get(tab.windowId) || "unknown",
      };
    });
    ExportUtils.exportJson(`tabs_${ExportUtils.dateStamp()}.json`, data);
  });

  try {
    await reload();
  } catch (error) {
    console.error("Error loading tabs:", error);
    showMessage(`Error: ${error.message}`);
  }
});
