// Transactional persistent store for visited pages.
//
// This file is loaded only by the background page. Extension pages access the
// store through runtime messages handled in background.js, so migration and
// mutations have one owner.
(function (global) {
  "use strict";

  const DB_NAME = "visit_tracker";
  const DB_VERSION = 1;
  const STORE_NAME = "visits";
  const LAST_VISIT_INDEX = "lastVisit";
  const LEGACY_STORAGE_KEY = "vt_visits_v1";
  const MAX_ENTRIES = 50000;

  let databasePromise;
  let initializationPromise;

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () =>
        reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "url",
        });
        store.createIndex(LAST_VISIT_INDEX, LAST_VISIT_INDEX);
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Visit database upgrade is blocked"));
    });

    // A failed open must be retryable.
    databasePromise.catch(() => {
      databasePromise = undefined;
    });
    return databasePromise;
  }

  async function migrateLegacyStorage() {
    const legacyResult = await browser.storage.local.get(LEGACY_STORAGE_KEY);
    const legacyMap = legacyResult[LEGACY_STORAGE_KEY];
    if (!legacyMap || typeof legacyMap !== "object") return;

    const records = Object.values(legacyMap).filter(
      (record) => record && typeof record.url === "string" && record.url,
    );
    if (records.length === 0) {
      await browser.storage.local.remove(LEGACY_STORAGE_KEY);
      return;
    }

    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const record of records) {
      store.put({
        url: record.url,
        title: typeof record.title === "string" ? record.title : "",
        firstVisit: Number(record.firstVisit) || Date.now(),
        lastVisit: Number(record.lastVisit) || Date.now(),
        visitCount: Math.max(1, Number(record.visitCount) || 1),
      });
    }
    await transactionDone(transaction);

    // Remove the old copy only after the IndexedDB transaction commits.
    await browser.storage.local.remove(LEGACY_STORAGE_KEY);
  }

  function initialize() {
    if (!initializationPromise) {
      initializationPromise = migrateLegacyStorage().catch((error) => {
        initializationPromise = undefined;
        throw error;
      });
    }
    return initializationPromise;
  }

  async function record({ url, title }, now) {
    if (!url) return;
    await initialize();

    const timestamp = now == null ? Date.now() : now;
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const existing = await requestResult(store.get(url));

    if (existing) {
      existing.lastVisit = timestamp;
      existing.visitCount = (existing.visitCount || 0) + 1;
      if (title) existing.title = title;
      store.put(existing);
    } else {
      store.add({
        url,
        title: title || "",
        firstVisit: timestamp,
        lastVisit: timestamp,
        visitCount: 1,
      });
    }

    const count = await requestResult(store.count());
    if (count > MAX_ENTRIES) {
      let remaining = count - MAX_ENTRIES;
      await new Promise((resolve, reject) => {
        const cursorRequest = store.index(LAST_VISIT_INDEX).openCursor();
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || remaining <= 0) {
            resolve();
            return;
          }
          cursor.delete();
          remaining -= 1;
          cursor.continue();
        };
      });
    }

    await transactionDone(transaction);
  }

  async function query({ text = "", offset = 0, limit = 200 } = {}) {
    await initialize();
    const normalizedText = String(text).toLocaleLowerCase().trim();
    const safeOffset = Math.max(0, Number(offset) || 0);
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(LAST_VISIT_INDEX);

    const items = [];
    let total = 0;

    if (!normalizedText) {
      total = await requestResult(store.count());
      if (safeOffset < total) {
        await new Promise((resolve, reject) => {
          let advanced = false;
          const request = index.openCursor(null, "prev");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || items.length >= safeLimit) {
              resolve();
              return;
            }
            if (!advanced && safeOffset > 0) {
              advanced = true;
              cursor.advance(safeOffset);
              return;
            }
            advanced = true;
            items.push(cursor.value);
            cursor.continue();
          };
        });
      }
      await transactionDone(transaction);
      return { items, total, offset: safeOffset, limit: safeLimit };
    }

    await new Promise((resolve, reject) => {
      const request = index.openCursor(null, "prev");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }

        const visit = cursor.value;
        const matches =
          (visit.title || "").toLocaleLowerCase().includes(normalizedText) ||
          visit.url.toLocaleLowerCase().includes(normalizedText);
        if (matches) {
          if (total >= safeOffset && items.length < safeLimit) {
            items.push(visit);
          }
          total += 1;
        }
        cursor.continue();
      };
    });
    await transactionDone(transaction);
    return { items, total, offset: safeOffset, limit: safeLimit };
  }

  async function getAll(text = "") {
    await initialize();
    const normalizedText = String(text).toLocaleLowerCase().trim();
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const index = transaction.objectStore(STORE_NAME).index(LAST_VISIT_INDEX);
    const items = [];
    await new Promise((resolve, reject) => {
      const request = index.openCursor(null, "prev");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const visit = cursor.value;
        if (
          !normalizedText ||
          (visit.title || "").toLocaleLowerCase().includes(normalizedText) ||
          visit.url.toLocaleLowerCase().includes(normalizedText)
        ) {
          items.push(visit);
        }
        cursor.continue();
      };
    });
    await transactionDone(transaction);
    return items;
  }

  async function remove(url) {
    await initialize();
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(url);
    await transactionDone(transaction);
  }

  async function clear() {
    await initialize();
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  }

  global.VisitStore = { initialize, record, query, getAll, remove, clear };
})(this);
