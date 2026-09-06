# Tab & History Manager 0.5

One package for Firefox Desktop 140+ and Firefox for Android 142+.

## Changes

- Duplicate closing respects Firefox containers; pinned/private tabs are protected.
- Remove the hidden 50,000-page retention limit. Existing IndexedDB data stays in place.
- Persist pending writes, retry transient failures, expose saving errors and manual retry.
- Idempotent queue replay prevents double counts after a crash between DB commit and acknowledgement.
- Delete/Clear serialize with queued writes and cancel pending visits.
- Update late page titles without incrementing counters or recreating deleted entries.
- Refresh tabs when moved between windows and focus the tab's current window.
- Improve narrow-screen overflow, hidden controls and touch targets.
- Keep Android independent of desktop-only history/windows APIs.
- Add locked Node development dependencies and automated regression tests.

## Validation

- Node syntax and automated regression tests: passed (see CI for the current count).
- Mozilla web-ext lint: passed; compatibility warnings, if any, are documented below.
- Real Firefox Desktop 152.0.4 in an isolated headless profile: navigation, reload,
  late title, visit deletion, tab rendering and 375px card layout passed.
- Android device/emulator test: pending; none was available on the build machine.
- AMO signing: pending. The ZIP is an unsigned upload archive.

## Before public distribution

1. On Firefox Android 142+, test installation, duplicate closing, tab activation,
   filtering, pagination, deletion, CSV/JSON downloads, and persistence after restart.
2. Upload dist/firefox-tab-manager-0.5.zip to AMO for review/signing.
3. Attach the resulting signed XPI to the release and publish it.

Pending writes survive restart only after browser.storage.local accepts them.
If both stores are unavailable, keep Firefox open until the visible error clears.
The extension still keeps an independent local log when Firefox History is cleared.
No data is transmitted and no additional permissions are requested.
