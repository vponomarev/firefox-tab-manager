document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("history-body");
  const filterInput = document.getElementById("filterInput");
  const countInfo = document.getElementById("countInfo");
  const exportCsvBtn = document.getElementById("exportCsv");
  const exportJsonBtn = document.getElementById("exportJson");

  let allHistory = [];
  let filteredHistory = [];

  // Загружаем историю
  try {
    // Можно ограничить диапазон, например: { text: "", startTime: Date.now() - 30*24*60*60*1000 }
    const historyItems = await browser.history.search({
      text: "",
      maxResults: 5000, // максимум, который обычно возвращается
    });

    // Фильтруем: только с URL и не служебные
    allHistory = historyItems
      .filter(
        (item) =>
          item.url &&
          !item.url.startsWith("about:") &&
          !item.url.startsWith("chrome://"),
      )
      .sort((a, b) => b.lastVisitTime - a.lastVisitTime); // новые — сверху

    filteredHistory = allHistory;
    renderTable(filteredHistory);
    updateCount();
  } catch (error) {
    console.error("Ошибка загрузки истории:", error);
    tbody.innerHTML = `<tr><td colspan="3" class="empty">Ошибка: ${error.message}</td></tr>`;
  }

  // === ФИЛЬТРАЦИЯ ===
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

  // === ОТОБРАЖЕНИЕ ===
  function renderTable(items) {
    tbody.innerHTML = "";
    if (items.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="empty">Нет записей по фильтру</td></tr>';
      return;
    }

    items.forEach((item) => {
      const tr = document.createElement("tr");

      // Название
      const tdTitle = document.createElement("td");
      let title = item.title || "(без названия)";
      if (title.length > 450) title = title.substring(0, 450) + "…";
      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = title;
      titleSpan.title = item.title;
      tdTitle.appendChild(titleSpan);

      // URL
      const tdUrl = document.createElement("td");
      let url = item.url || "";
      if (url.length > 450) url = url.substring(0, 450) + "…";
      const urlSpan = document.createElement("span");
      urlSpan.className = "url";
      urlSpan.textContent = url;
      urlSpan.title = item.url;
      tdUrl.appendChild(urlSpan);

      // Дата и время
      const tdDate = document.createElement("td");
      const date = new Date(item.lastVisitTime);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      tdDate.className = "date";
      tdDate.textContent = `${dateStr} ${timeStr}`;

      tr.appendChild(tdTitle);
      tr.appendChild(tdUrl);
      tr.appendChild(tdDate);
      tbody.appendChild(tr);
    });
  }

  // === СЧЁТЧИК ===
  function updateCount() {
    const total = allHistory.length;
    const shown = filteredHistory.length;
    countInfo.textContent = `Показано: ${shown} / Всего: ${total}`;
  }

  // === ЭКСПОРТ CSV ===
  exportCsvBtn.addEventListener("click", () => {
    const data = filteredHistory;
    const csv = [["Название", "URL", "Посещено"].join(";")];
    data.forEach((item) => {
      const date = new Date(item.lastVisitTime)
        .toISOString()
        .replace("T", " ")
        .split(".")[0];
      const row = [
        `"${(item.title || "").replace(/"/g, '""')}"`,
        `"${item.url}"`,
        `"${date}"`,
      ].join(";");
      csv.push(row);
    });
    const blob = new Blob([csv.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `история_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // === ЭКСПОРТ JSON ===
  exportJsonBtn.addEventListener("click", () => {
    const data = filteredHistory.map((item) => ({
      title: item.title,
      url: item.url,
      lastVisitTime: new Date(item.lastVisitTime).toISOString(),
      visitCount: item.visitCount,
    }));
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `история_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
});
