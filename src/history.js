document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("history-body");
  const filterInput = document.getElementById("filterInput");
  const countInfo = document.getElementById("countInfo");
  const exportCsvBtn = document.getElementById("exportCsv");
  const exportJsonBtn = document.getElementById("exportJson");

  let allHistory = [];
  let filteredHistory = [];

  // Load history. startTime: 0 is required — without it history.search only
  // returns the last 24 hours regardless of maxResults.
  try {
    const historyItems = await browser.history.search({
      text: "",
      startTime: 0,
      maxResults: 5000,
    });

    allHistory = historyItems
      .filter(
        (item) =>
          item.url &&
          !item.url.startsWith("about:") &&
          !item.url.startsWith("chrome://"),
      )
      .sort((a, b) => b.lastVisitTime - a.lastVisitTime); // newest first

    filteredHistory = allHistory;
    renderTable(filteredHistory);
    updateCount();
  } catch (error) {
    console.error("Error loading history:", error);
    tbody.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "empty";
    td.textContent = `Error: ${error.message}`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  // === FILTER ===
  filterInput.addEventListener("input", () => {
    const query = filterInput.value.toLowerCase().trim();
    if (!query) {
      filteredHistory = allHistory;
    } else {
      filteredHistory = allHistory.filter((item) => {
        const title = (item.title || "").toLowerCase();
        const url = (item.url || "").toLowerCase();
        return title.includes(query) || url.includes(query);
      });
    }
    renderTable(filteredHistory);
    updateCount();
  });

  // === RENDER ===
  function renderTable(items) {
    tbody.replaceChildren();
    if (items.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.className = "empty";
      td.textContent = "No matching records";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    items.forEach((item) => {
      const tr = document.createElement("tr");

      // Title
      const tdTitle = document.createElement("td");
      let title = item.title || "(no title)";
      if (title.length > 450) title = title.substring(0, 450) + "…";
      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = title;
      titleSpan.title = item.title || "";
      tdTitle.appendChild(titleSpan);

      // URL
      const tdUrl = document.createElement("td");
      let url = item.url || "";
      if (url.length > 450) url = url.substring(0, 450) + "…";
      const urlSpan = document.createElement("span");
      urlSpan.className = "url";
      urlSpan.textContent = url;
      urlSpan.title = item.url || "";
      tdUrl.appendChild(urlSpan);

      // Date/time
      const tdDate = document.createElement("td");
      const date = new Date(item.lastVisitTime);
      tdDate.className = "date";
      tdDate.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

      tr.appendChild(tdTitle);
      tr.appendChild(tdUrl);
      tr.appendChild(tdDate);
      tbody.appendChild(tr);
    });
  }

  // === COUNT ===
  function updateCount() {
    countInfo.textContent = `Shown: ${filteredHistory.length} / Total: ${allHistory.length}`;
  }

  // === EXPORT CSV ===
  exportCsvBtn.addEventListener("click", () => {
    const rows = filteredHistory.map((item) => [
      item.title || "",
      item.url || "",
      new Date(item.lastVisitTime).toISOString().replace("T", " ").split(".")[0],
    ]);
    ExportUtils.exportCsv(
      `history_${ExportUtils.dateStamp()}.csv`,
      ["Title", "URL", "Visited"],
      rows,
    );
  });

  // === EXPORT JSON ===
  exportJsonBtn.addEventListener("click", () => {
    const data = filteredHistory.map((item) => ({
      title: item.title,
      url: item.url,
      lastVisitTime: new Date(item.lastVisitTime).toISOString(),
      visitCount: item.visitCount,
    }));
    ExportUtils.exportJson(`history_${ExportUtils.dateStamp()}.json`, data);
  });
});
