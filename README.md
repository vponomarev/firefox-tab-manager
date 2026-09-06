# Firefox Tab & History Manager

Manage tabs and keep a searchable local visit log on **Firefox Desktop 140+**
and **Firefox for Android 142+**. Version **0.5** uses the same package on both.

## Features

- **Close duplicates** keeps the last unpinned occurrence of each URL within
  its Firefox container. Pinned, private and unknown-container desktop tabs
  are left alone. Desktop operates in the current window; Android in all tabs.
- **Show all tabs** has filtering, live updates (including moves between
  windows), click-to-focus, per-tab close, and CSV/JSON export.
- **History** searches and exports up to 5,000 Firefox history entries across
  the full time range. Firefox History integration is desktop-only.
- **Tracked pages** records non-private HTTP(S) pages into IndexedDB, with
  first/last visit timestamps, visit counts, title/URL search and pagination.
  Titles that change after loading are updated without counting another visit.
- Android uses responsive cards, touch controls and 50 records per page.
  Its Tracked pages view works without the desktop history/windows APIs.

## Storage and privacy

Pages are retained **until you delete them**. The old 50,000-URL automatic
removal has been removed. Previously deleted records cannot be recovered.
Export regularly: local storage is not a backup and available disk space is finite.

The visit log is separate from Firefox History: clearing either one does not
clear the other. Private-window pages and non-HTTP(S) pages are not recorded.
No browsing data is transmitted outside the browser.

Pending changes are saved in `browser.storage.local` before writing to IndexedDB.
Failed writes retry after 1, 5 and 30 seconds, then pause with a visible error
and a **Retry saving** button in the popup and Tracked pages. Saved pending
changes resume on restart; replay does not double-count visits. If the browser
cannot write the pending queue itself, changes remain in memory: keep Firefox
open until saving succeeds. Delete/Clear also cancel matching pending changes.

Permissions remain `tabs`, `history` and `storage`; no new permissions are added.
The data-collection declaration remains `none`.

## Development and build

Node.js 24 is required. From the repository root:

```sh
npm ci
npm test
npm run lint
npm run build
```

The upload package is `dist/firefox-tab-manager-0.5.zip`, with `manifest.json`
at its root. It is an **unsigned AMO upload archive**, not a signed installation
package. For regular Firefox installations, submit it to AMO and obtain a
signed XPI. Both desktop and Android use that signed package.

For a temporary desktop install, open `about:debugging#/runtime/this-firefox`,
choose **Load Temporary Add-on** and select `src/manifest.json`.

## Validation

`npm test` covers containers, tracking, migration, more than 50,000 records,
crash replay, retries, deletion races and desktop/Android UI paths.

`npm run test:firefox` runs a real Firefox Desktop smoke test using a temporary
profile and local fixture server. Set `FIREFOX_BINARY` if Firefox is not at the
default path. The test does not access the user's profile.

For a connected Android device or configured emulator:

```sh
npx web-ext run --target firefox-android --source-dir src --android-device DEVICE_ID
```

Before public Android distribution, test installation, navigation/reload,
background/restart persistence, duplicate closing, search, deletion and CSV/JSON
downloads on a device. No Android device/emulator was available for the 0.5
local checks; simulated API tests and responsive-layout checks do not replace it.

See [RELEASE-0.5.md](RELEASE-0.5.md) for release status and remaining checks.
