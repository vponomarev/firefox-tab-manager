# Firefox Tab & History Manager

A Firefox extension to manage open tabs, browse history, and keep a searchable
log of visited pages.

## Features

- **Close duplicates** — close duplicate tabs in the current window (keeps the
  last one, skips pinned tabs).
- **Show all tabs** — a full-page table of every open tab across all windows,
  with live updates, filtering, click-to-focus, per-tab close, and CSV/JSON
  export.
- **History** — a searchable view of up to 5,000 Firefox history entries across
  the full time range (not just the last 24h), with CSV/JSON export.
- **Tracked pages** — the extension's own log of visited pages, recorded in the
  background into a transactional IndexedDB database. Each entry keeps the
  title, URL, first/last visit timestamps and a visit counter. Searchable,
  paginated, exportable, with per-entry delete and "clear all". Private-window
  pages are never tracked.

## Why a separate visit log?

Firefox's `history` API is limited (e.g. `history.search` defaults to the last
24 hours). The background tracker (`background.js` + `storage.js`) maintains an
independent, persistent log so pages can be searched later. The store is keyed
by URL and carries timestamps, which is the groundwork for planned features.

## Roadmap

Full-text search over the visit log and self-hosted cross-device sync — see
[ROADMAP.md](ROADMAP.md) for the plan, phases, and sync server design.

## Permissions

- `tabs` — enumerate/close/focus tabs.
- `history` — read Firefox browsing history.
- `storage` — persist the visit log locally.

No data leaves the browser (`data_collection_permissions: none`).

## Development install

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `src/manifest.json`

## Build

```sh
./build.sh   # produces firefox-tab-manager.zip from src/
```
