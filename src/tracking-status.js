document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("trackingStatus");
  const message = document.getElementById("trackingMessage");
  const retry = document.getElementById("retryTracking");
  let generation = 0;

  async function refresh() {
    const current = ++generation;
    try {
      const status = await browser.runtime.sendMessage({
        type: "visit-store",
        action: "status",
      });
      if (current !== generation) return;
      panel.hidden = !status.failed;
      message.textContent = status.paused
        ? `Saving is paused. Pending changes: ${status.pending}. Check available storage and retry. Keep Firefox open until saving succeeds.`
        : `Unable to save visits. Pending changes: ${status.pending}. Retrying automatically. Keep Firefox open until saving succeeds.`;
    } catch (_error) {
      if (current !== generation) return;
      panel.hidden = false;
      message.textContent =
        "Visit tracking is unavailable. Retry or restart Firefox.";
    }
  }

  retry.addEventListener("click", async () => {
    retry.disabled = true;
    try {
      await browser.runtime.sendMessage({
        type: "visit-store",
        action: "retry",
      });
    } catch (_error) {
      message.textContent =
        "Retry failed. Restart Firefox and check available storage.";
    } finally {
      retry.disabled = false;
      await refresh();
    }
  });
  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === "visit-store-changed") refresh();
  });
  refresh();
});
