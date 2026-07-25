document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("visits-body");
  const filterInput = document.getElementById("filterInput");
  const countInfo = document.getElementById("countInfo");
  const pageInfo = document.getElementById("pageInfo");
  const previousPageBtn = document.getElementById("previousPage");
  const nextPageBtn = document.getElementById("nextPage");
  const exportCsvBtn = document.getElementById("exportCsv");
  const exportJsonBtn = document.getElementById("exportJson");
  const clearAllBtn = document.getElementById("clearAll");
  const capabilities = await Platform.getCapabilities();
  const PAGE_SIZE = capabilities.isAndroid ? 50 : 200;

  if (capabilities.isAndroid) {
    document.documentElement.classList.add("android");
  }

  let currentVisits = [];
  let totalVisits = 0;
  let offset = 0;
  let loadGeneration = 0;
  let filterTimer;

  function callStore(action, properties = {}) {
    return browser.runtime.sendMessage({
      type: "visit-store",
      action,
      ...properties,
    });
  }

  function fmtDate(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime())
      ? ""
      : `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }

  function showMessage(message) {
    tbody.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty";
    cell.textContent = message;
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  async function loadPage() {
    const generation = ++loadGeneration;
    try {
      const page = await callStore("query", {
        options: {
          text: filterInput.value,
          offset,
          limit: PAGE_SIZE,
        },
      });
      if (generation !== loadGeneration) return;

      // A deletion in another context may leave the current page past the end.
      if (page.total > 0 && offset >= page.total) {
        offset = Math.floor((page.total - 1) / PAGE_SIZE) * PAGE_SIZE;
        await loadPage();
        return;
      }

      currentVisits = page.items;
      totalVisits = page.total;
      renderTable();
      updateNavigation();
    } catch (error) {
      if (generation !== loadGeneration) return;
      console.error("Error loading visits:", error);
      showMessage(`Error: ${error.message}`);
    }
  }

  function renderTable() {
    tbody.replaceChildren();
    if (currentVisits.length === 0) {
      showMessage("No records");
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const visit of currentVisits) {
      const row = document.createElement("tr");

      const titleCell = document.createElement("td");
      titleCell.dataset.label = "Title";
      let title = visit.title || "(no title)";
      if (title.length > 450) title = `${title.substring(0, 450)}…`;
      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = title;
      titleSpan.title = visit.title || "";
      titleCell.appendChild(titleSpan);

      const urlCell = document.createElement("td");
      urlCell.dataset.label = "URL";
      urlCell.className = "url";
      let urlText = visit.url || "";
      if (urlText.length > 450) urlText = `${urlText.substring(0, 450)}…`;
      const link = document.createElement("a");
      link.href = visit.url;
      link.textContent = urlText;
      link.title = visit.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      urlCell.appendChild(link);

      const firstVisitCell = document.createElement("td");
      firstVisitCell.dataset.label = "First visit";
      firstVisitCell.className = "date";
      firstVisitCell.textContent = fmtDate(visit.firstVisit);

      const lastVisitCell = document.createElement("td");
      lastVisitCell.dataset.label = "Last visit";
      lastVisitCell.className = "date";
      lastVisitCell.textContent = fmtDate(visit.lastVisit);

      const countCell = document.createElement("td");
      countCell.dataset.label = "Visits";
      countCell.style.textAlign = "center";
      countCell.textContent = String(visit.visitCount || 1);

      const actionCell = document.createElement("td");
      actionCell.dataset.label = "Action";
      const deleteButton = document.createElement("button");
      deleteButton.textContent = "Delete";
      deleteButton.className = "close-btn";
      deleteButton.addEventListener("click", async () => {
        deleteButton.disabled = true;
        try {
          await callStore("remove", { url: visit.url });
          await loadPage();
        } catch (error) {
          deleteButton.disabled = false;
          console.error("Error deleting record:", error);
          alert("Unable to delete record");
        }
      });
      actionCell.appendChild(deleteButton);

      row.appendChild(titleCell);
      row.appendChild(urlCell);
      row.appendChild(firstVisitCell);
      row.appendChild(lastVisitCell);
      row.appendChild(countCell);
      row.appendChild(actionCell);
      fragment.appendChild(row);
    }
    tbody.appendChild(fragment);
  }

  function updateNavigation() {
    const first = totalVisits === 0 ? 0 : offset + 1;
    const last = Math.min(offset + currentVisits.length, totalVisits);
    countInfo.textContent = `Shown: ${first}-${last} / Total: ${totalVisits}`;

    const currentPage = totalVisits === 0 ? 0 : Math.floor(offset / PAGE_SIZE) + 1;
    const pageCount =
      totalVisits === 0 ? 0 : Math.ceil(totalVisits / PAGE_SIZE);
    pageInfo.textContent = `Page ${currentPage} / ${pageCount}`;
    previousPageBtn.disabled = offset === 0;
    nextPageBtn.disabled = offset + currentVisits.length >= totalVisits;
  }

  filterInput.addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      offset = 0;
      loadPage();
    }, 200);
  });

  previousPageBtn.addEventListener("click", () => {
    offset = Math.max(0, offset - PAGE_SIZE);
    loadPage();
  });

  nextPageBtn.addEventListener("click", () => {
    if (offset + currentVisits.length < totalVisits) {
      offset += PAGE_SIZE;
      loadPage();
    }
  });

  clearAllBtn.addEventListener("click", async () => {
    if (!confirm("Delete the entire visit log? This cannot be undone.")) return;
    clearAllBtn.disabled = true;
    try {
      await callStore("clear");
      offset = 0;
      await loadPage();
    } catch (error) {
      console.error("Error clearing log:", error);
      alert("Unable to clear log");
    } finally {
      clearAllBtn.disabled = false;
    }
  });

  async function loadExportData() {
    exportCsvBtn.disabled = true;
    exportJsonBtn.disabled = true;
    try {
      return await callStore("getAll", { text: filterInput.value });
    } finally {
      exportCsvBtn.disabled = false;
      exportJsonBtn.disabled = false;
    }
  }

  exportCsvBtn.addEventListener("click", async () => {
    try {
      const visits = await loadExportData();
      const rows = visits.map((visit) => [
        visit.title || "",
        visit.url || "",
        new Date(visit.firstVisit).toISOString(),
        new Date(visit.lastVisit).toISOString(),
        visit.visitCount || 1,
      ]);
      ExportUtils.exportCsv(
        `visited_pages_${ExportUtils.dateStamp()}.csv`,
        ["Title", "URL", "First visit", "Last visit", "Visits"],
        rows,
      );
    } catch (error) {
      console.error("Error exporting visits:", error);
      alert("Unable to export visit log");
    }
  });

  exportJsonBtn.addEventListener("click", async () => {
    try {
      const visits = await loadExportData();
      const data = visits.map((visit) => ({
        title: visit.title,
        url: visit.url,
        firstVisit: new Date(visit.firstVisit).toISOString(),
        lastVisit: new Date(visit.lastVisit).toISOString(),
        visitCount: visit.visitCount,
      }));
      ExportUtils.exportJson(
        `visited_pages_${ExportUtils.dateStamp()}.json`,
        data,
      );
    } catch (error) {
      console.error("Error exporting visits:", error);
      alert("Unable to export visit log");
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === "visit-store-changed") {
      loadPage();
    }
  });

  await loadPage();
});
