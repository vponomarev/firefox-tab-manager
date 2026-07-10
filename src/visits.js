document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("visits-body");
  const filterInput = document.getElementById("filterInput");
  const countInfo = document.getElementById("countInfo");
  const exportCsvBtn = document.getElementById("exportCsv");
  const exportJsonBtn = document.getElementById("exportJson");
  const clearAllBtn = document.getElementById("clearAll");

  let allVisits = [];
  let filteredVisits = [];

  function fmtDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  }

  async function load() {
    try {
      allVisits = (await VisitStore.getAll()).sort(
        (a, b) => b.lastVisit - a.lastVisit,
      );
      applyFilter();
    } catch (error) {
      console.error("Error loading visits:", error);
      tbody.replaceChildren();
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "empty";
      td.textContent = `Error: ${error.message}`;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function applyFilter() {
    const query = filterInput.value.toLowerCase().trim();
    if (!query) {
      filteredVisits = allVisits;
    } else {
      filteredVisits = allVisits.filter((v) => {
        const title = (v.title || "").toLowerCase();
        const url = (v.url || "").toLowerCase();
        return title.includes(query) || url.includes(query);
      });
    }
    renderTable(filteredVisits);
    updateCount();
  }

  function renderTable(items) {
    tbody.replaceChildren();
    if (items.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "empty";
      td.textContent = "No records";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    items.forEach((visit) => {
      const tr = document.createElement("tr");

      // Title
      const tdTitle = document.createElement("td");
      let title = visit.title || "(no title)";
      if (title.length > 450) title = title.substring(0, 450) + "…";
      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = title;
      titleSpan.title = visit.title || "";
      tdTitle.appendChild(titleSpan);

      // URL (clickable link that opens the page in a new tab)
      const tdUrl = document.createElement("td");
      tdUrl.className = "url";
      let urlText = visit.url || "";
      if (urlText.length > 450) urlText = urlText.substring(0, 450) + "…";
      const link = document.createElement("a");
      link.href = visit.url;
      link.textContent = urlText;
      link.title = visit.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      tdUrl.appendChild(link);

      // First / last visit
      const tdFirst = document.createElement("td");
      tdFirst.className = "date";
      tdFirst.textContent = fmtDate(visit.firstVisit);

      const tdLast = document.createElement("td");
      tdLast.className = "date";
      tdLast.textContent = fmtDate(visit.lastVisit);

      // Visit count
      const tdCount = document.createElement("td");
      tdCount.style.textAlign = "center";
      tdCount.textContent = String(visit.visitCount || 1);

      // Delete
      const tdAction = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "close-btn";
      delBtn.addEventListener("click", async () => {
        try {
          await VisitStore.remove(visit.url);
          allVisits = allVisits.filter((v) => v.url !== visit.url);
          filteredVisits = filteredVisits.filter((v) => v.url !== visit.url);
          tr.remove();
          updateCount();
        } catch (err) {
          console.error("Error deleting record:", err);
          alert("Unable to delete record");
        }
      });
      tdAction.appendChild(delBtn);

      tr.appendChild(tdTitle);
      tr.appendChild(tdUrl);
      tr.appendChild(tdFirst);
      tr.appendChild(tdLast);
      tr.appendChild(tdCount);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    });
  }

  function updateCount() {
    countInfo.textContent = `Shown: ${filteredVisits.length} / Total: ${allVisits.length}`;
  }

  filterInput.addEventListener("input", applyFilter);

  clearAllBtn.addEventListener("click", async () => {
    if (!confirm("Delete the entire visit log? This cannot be undone.")) return;
    try {
      await VisitStore.clear();
      allVisits = [];
      filteredVisits = [];
      renderTable(filteredVisits);
      updateCount();
    } catch (err) {
      console.error("Error clearing log:", err);
      alert("Unable to clear log");
    }
  });

  exportCsvBtn.addEventListener("click", () => {
    const rows = filteredVisits.map((v) => [
      v.title || "",
      v.url || "",
      new Date(v.firstVisit).toISOString(),
      new Date(v.lastVisit).toISOString(),
      v.visitCount || 1,
    ]);
    ExportUtils.exportCsv(
      `visited_pages_${ExportUtils.dateStamp()}.csv`,
      ["Title", "URL", "First visit", "Last visit", "Visits"],
      rows,
    );
  });

  exportJsonBtn.addEventListener("click", () => {
    const data = filteredVisits.map((v) => ({
      title: v.title,
      url: v.url,
      firstVisit: new Date(v.firstVisit).toISOString(),
      lastVisit: new Date(v.lastVisit).toISOString(),
      visitCount: v.visitCount,
    }));
    ExportUtils.exportJson(`visited_pages_${ExportUtils.dateStamp()}.json`, data);
  });

  await load();
});
