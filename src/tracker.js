// Durable, ordered writes. Only the background page owns this queue.
(function (global) {
  "use strict";

  function create({
    store,
    storage,
    onChange = () => {},
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    createId = () => crypto.randomUUID(),
    now = () => Date.now(),
  }) {
    const KEY = "vt_pending_v1";
    const delays = [1000, 5000, 30000];
    let pending = [];
    let loaded = false;
    let chain = Promise.resolve();
    let running = false;
    let timer;
    let failures = 0;
    let failed = false;

    function exclusive(action) {
      const result = chain.then(action);
      chain = result.catch(() => {});
      return result;
    }

    async function load() {
      if (loaded) return;
      const saved = await storage.get(KEY);
      pending = (Array.isArray(saved[KEY]) ? saved[KEY] : []).concat(pending);
      loaded = true;
    }

    function save() {
      return storage.set({ [KEY]: pending });
    }

    function status() {
      return {
        pending: pending.length,
        failed,
        paused: failures > delays.length,
      };
    }

    function changed() {
      Promise.resolve(onChange(status())).catch(() => {});
    }

    function failure(error) {
      console.error("Visit queue write failed:", error);
      failed = true;
      failures += 1;
      if (failures <= delays.length) {
        timer = setTimer(
          () => {
            timer = undefined;
            drain();
          },
          delays[failures - 1],
        );
      }
      changed();
    }

    async function drain() {
      if (running || timer !== undefined || failures > delays.length) return;
      running = true;
      try {
        while (
          await exclusive(async () => {
            await load();
            if (!pending.length) return false;
            // Commit the queue before touching IndexedDB. Replaying a record
            // after a crash is safe because record() checks the operation ID.
            await save();
            const job = pending[0];
            if (job.kind === "record") {
              await store.record(job.page, job.timestamp, job.id);
            } else {
              await store.updateTitle(job.page);
            }
            pending.shift();
            try {
              await save();
            } catch (error) {
              pending.unshift(job);
              throw error;
            }
            failures = 0;
            failed = false;
            return true;
          })
        ) {
          changed();
        }
        failed = false;
        failures = 0;
        changed();
      } catch (error) {
        failure(error);
      } finally {
        running = false;
        if (
          pending.length &&
          timer === undefined &&
          failures <= delays.length
        ) {
          drain();
        }
      }
    }

    async function enqueue(kind, page) {
      const job = { kind, page: { ...page }, timestamp: now(), id: createId() };
      await exclusive(async () => {
        pending.push(job);
        // Preserve incoming visits even if reading the saved queue fails.
        try {
          await load();
          await save();
        } catch (error) {
          console.error("Unable to persist visit queue:", error);
          failed = true;
          changed();
        }
      });
      drain();
    }

    async function retry() {
      await exclusive(() => {
        if (timer !== undefined) clearTimer(timer);
        timer = undefined;
        failures = 0;
      });
      await drain();
      return status();
    }

    async function remove(url) {
      await exclusive(async () => {
        await load();
        const previous = pending;
        pending =
          url === undefined
            ? []
            : pending.filter((job) => job.page.url !== url);
        try {
          await save();
        } catch (error) {
          pending = previous;
          throw error;
        }
        // Serialize deletion with in-flight writes so retries cannot resurrect
        // a deleted page. Title-only jobs never create a missing record.
        if (url === undefined) await store.clear();
        else await store.remove(url);
        if (!pending.length) {
          failed = false;
          failures = 0;
          if (timer !== undefined) clearTimer(timer);
          timer = undefined;
        }
      });
      changed();
      drain();
    }

    return { start: drain, enqueue, retry, remove, status };
  }

  global.VisitTracker = { create };
})(this);
