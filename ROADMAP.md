# Roadmap

## Vision

Turn the extension into a personal, **searchable long-term memory of everything
visited**, that stays in sync across the user's devices — going well beyond
Firefox's built-in history (whose `history.search` is capped to the last 24h by
default and can't be reliably searched long-term).

## Current state (v0.3)

- Background tracker records non-private HTTP(S) pages into IndexedDB
  (`background.js` + `storage.js`), keyed by URL with `firstVisit` /
  `lastVisit` / `visitCount`.
- `visits.html/js` — paginated searchable UI over the local log (filter,
  delete, clear, CSV/JSON export).
- Tabs list with live refresh; history viewer (up to 5,000 entries across the
  full time range); close-duplicates.

The storage schema is intentionally sync-friendly: URL is a stable id and
`lastVisit` gives a natural ordering for last-write-wins merges.

---

## Phase 1 — Full-text search over the local log

Make the visit log genuinely searchable, not just substring-filtered.

- Search across title + URL with ranking (recency + visit count).
- Match on URL path/host, not just raw substring.
- Optional date-range and host filters.
- Consider an in-memory inverted index built on page load; revisit a persisted
  index only if the log grows large enough to make load slow.
- Keyboard-first UX (focus search on open, arrow-key navigation).

## Phase 2 — Cross-device sync

Merge each device's local log into a shared view. Requires a **self-hosted
server** (see design below); `browser.storage.sync` is unsuitable (~100 KB
quota, far too small for a page log).

- Client sync module in the extension (push local changes, pull remote changes).
- Track a per-device sync cursor (last successful `lastVisit`/sequence synced).
- Merge strategy: last-write-wins per URL on `lastVisit`.
- Settings UI: server URL + auth token, "sync now", last-sync status.
- Privacy: data now leaves the browser → update
  `data_collection_permissions` in the manifest and document it.

## Phase 3 — Polish

- Migrate to Manifest V3 (event-driven background / non-persistent worker).
  Kept MV2 for now because a persistent background page suits continuous
  tracking; MV3 needs the tracker restructured to survive worker suspension.
- Localization via `_locales` + `i18n.getMessage` (currently English-only).
- Automated checks in CI (`web-ext lint`, `node --check`).

---

## Sync server design (brief)

A small, self-hostable service that stores each user's merged visit log and lets
multiple devices converge on it.

**Model.** One logical log per user. Each record is
`{ url, title, firstVisit, lastVisit, visitCount }`, keyed by `url`. The server
holds the authoritative merged copy.

**API (REST/JSON over HTTPS, bearer-token auth):**

- `POST /sync/push` — body: records changed on the device since its last push.
  Server merges each: last-write-wins on `lastVisit`; `firstVisit = min`,
  `visitCount = max` (avoids double-counting from re-pushes — a per-device delta
  scheme can improve this later).
- `GET /sync/pull?since=<cursor>` — returns records with `lastVisit > cursor`
  plus a new cursor, so devices fetch only what changed.
- `DELETE /sync/record` — propagate deletions (needs tombstones, see below).

**Deletions.** To sync a delete, keep a tombstone (`url` + `deletedAt`) rather
than dropping the row, so other devices remove it on pull. Purge old tombstones
periodically.

**Storage.** SQLite for single-user self-hosting; Postgres if multi-user.
Index on `(user_id, lastVisit)` for cheap incremental pulls.

**Auth & privacy.** Per-device bearer token (revocable). HTTPS mandatory.
Optional client-side encryption of `title`/`url` so the server stores only
ciphertext (server can't merge on content then — merge stays keyed on a hash of
the URL). Decide encryption before first deployment; it's hard to add later.

**Tech (suggested).** Small Go or Node service, stateless behind the DB, easy to
run in a container. No framework needed for this surface area.

---

## Task checklist

Phase 1 — search
- [ ] Ranked search over the local log (title + URL, recency + visit count)
- [ ] Host / date-range filters
- [ ] Keyboard-first search UX

Phase 2 — sync
- [ ] Build the sync server (push / pull / delete, LWW merge, tombstones)
- [ ] Extension sync module (cursor tracking, batched push/pull)
- [ ] Settings UI (server URL, token, sync-now, status)
- [ ] Update `data_collection_permissions` + privacy docs

Phase 3 — polish
- [ ] Migrate to Manifest V3
- [ ] `_locales` localization
- [ ] CI (`web-ext lint`, `node --check`)
