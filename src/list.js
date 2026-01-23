document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("tabs-body");
  const filterInput = document.getElementById("filterInput");
  const countInfo = document.getElementById("countInfo");
  const exportCsvBtn = document.getElementById("exportCsv");
  const exportJsonBtn = document.getElementById("exportJson");

  let allTabs = [];
  let filteredTabs = [];
  let windowMap = new Map(); // Объявляем заранее

  // Загрузка всех вкладок и окон
  try {
    // Сначала получаем окна
    const windows = await browser.windows.getAll();
    windowMap = new Map(
      windows.map((win) => [win.id, win.incognito ? "Приватное" : "Обычное"]),
    );

    // Затем вкладки
    allTabs = await browser.tabs.query({});

    // Сортировка: по окну, потом по индексу
    allTabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index);

    // Инициализация фильтра
    filteredTabs = allTabs;

    // Отображаем
    renderTable(filteredTabs);
    updateCount();
  } catch (error) {
    console.error("Ошибка загрузки вкладок:", error);
    tbody.innerHTML = `<tr><td colspan="4" class="empty">Ошибка: ${error.message}</td></tr>`;
    return;
  }

  // === ОТОБРАЖЕНИЕ ТАБЛИЦЫ ===
  function renderTable(tabs) {
    tbody.innerHTML = "";
    if (tabs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="empty">Нет вкладок по фильтру</td></tr>';
      return;
    }

    tabs.forEach((tab) => {
      const tr = document.createElement("tr");

      // Название
      const tdTitle = document.createElement("td");
      let title = tab.title || "(без названия)";
      if (title.length > 450) title = title.substring(0, 450) + "…";
      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = title;
      titleSpan.title = tab.title;
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
      urlSpan.title = tab.url;
      tdUrl.appendChild(urlSpan);

      // Окно
      const tdWindow = document.createElement("td");
      tdWindow.className = "window";
      const windowType = windowMap.get(tab.windowId) || "Неизвестно";
      tdWindow.textContent = `Окно ${tab.windowId} (${windowType})`;

      // Кнопка "Закрыть"
      const tdAction = document.createElement("td");
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "Закрыть";
      closeBtn.className = "close-btn";
      closeBtn.addEventListener("click", async () => {
        try {
          await browser.tabs.remove(tab.id);
          tr.remove();
          updateCount();
        } catch (err) {
          console.error("Ошибка при закрытии:", err);
          alert("Не удалось закрыть вкладку");
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

  // === СЧЁТЧИК ===
  function updateCount() {
    const total = allTabs.length;
    const shown = filteredTabs.length;
    countInfo.textContent = `Показано: ${shown} / Всего: ${total}`;
  }

  // === ФИЛЬТРАЦИЯ ===
  filterInput.addEventListener("input", () => {
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
  });

  // === ЭКСПОРТ В CSV ===
  exportCsvBtn.addEventListener("click", () => {
    const data = filteredTabs;
    const csv = [
      ["Название", "URL", "Окно ID", "Тип окна", "Индекс"].join(";"),
    ];
    data.forEach((tab) => {
      const windowType = windowMap.get(tab.windowId) || "Неизвестно";
      const row = [
        `"${(tab.title || "").replace(/"/g, '""')}"`,
        `"${tab.url || ""}"`,
        tab.windowId,
        `"${windowType}"`,
        tab.index,
      ].join(";");
      csv.push(row);
    });
    const blob = new Blob([csv.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `вкладки_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // === ЭКСПОРТ В JSON ===
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
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `вкладки_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
});
