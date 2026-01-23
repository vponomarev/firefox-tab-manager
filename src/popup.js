document.addEventListener("DOMContentLoaded", () => {
  const openListBtn = document.getElementById("openList");
  const closeDuplicatesBtn = document.getElementById("closeDuplicates");
  const status = document.getElementById("status");

  // Кнопка: открыть список вкладок
  openListBtn.addEventListener("click", () => {
    const url = browser.runtime.getURL("list.html");
    console.log("URL страницы:", url); // ← посмотри в консоль
    // Открываем новую вкладку с list.html
    browser.tabs.create({
      url: browser.runtime.getURL("list.html"),
    });
  });

  // Внутри DOMContentLoaded
  const openHistoryBtn = document.getElementById("openHistory");
  openHistoryBtn.addEventListener("click", () => {
    browser.tabs.create({
      url: browser.runtime.getURL("history.html"),
    });
  });

  // Кнопка: удалить дубли
  closeDuplicatesBtn.addEventListener("click", async () => {
    status.textContent = "Поиск дублей...";

    try {
      const tabs = await browser.tabs.query({ currentWindow: true });
      tabs.sort((a, b) => a.index - b.index);

      const urlSet = new Set();
      const duplicates = [];

      for (let i = tabs.length - 1; i >= 0; i--) {
        const tab = tabs[i];
        if (
          !tab.url ||
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
        status.textContent = "✅ Нет дублей!";
      } else {
        await browser.tabs.remove(duplicates);
        status.textContent = `✅ Удалено: ${duplicates.length} дублей`;
      }
    } catch (error) {
      console.error(error);
      status.textContent = "❌ Ошибка";
    }
  });
});
