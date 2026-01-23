// background.js
console.log("✅ Background script загружен");

if (browser.history) {
  console.log("✅ browser.history ДОСТУПЕН в фоне");
} else {
  console.error("❌ browser.history НЕДОСТУПЕН в фоне");
}

// Проверим, что другие API работают
console.log("browser.tabs:", !!browser.tabs);
