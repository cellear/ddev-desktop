# Sprint 6: Find projects, and a window of its own

**Sprint Goal:** with a hundred-plus projects the sidebar is searchable and
filterable by type, and the panel opens in its own window instead of a
browser tab with a drawn-on window frame.

Status values: `[todo]` `[doing]` `[done]` `[dropped]`

---

## Stories

### S6-1: Search and type filter
**Status:** [done]
**Owner:** claude

A filter row at the top of the sidebar: a search box (matches name,
hostname and type, case-insensitive) and a type dropdown listing the
types present among all projects, with counts. The daemon now returns
every project (most recently started first) and tells the page the
display limit; with no filter the page shows the first 20 and a "20 of
119 · Show all" line underneath; with a filter it shows every match and
says how many. The selected project stays selected even when filtered
out of view.

**Acceptance:** typing "back" shows only Backdrop projects; choosing
"drupal10" in the dropdown lists all Drupal 10 projects, including ones
outside the recent twenty.

### S6-2: Own window
**Status:** [done]
**Owner:** claude

The daemon opens the page in a Chromium app window (`--app=URL`), which
is a real OS window with its own title bar and no tabs or address bar.
It tries Google Chrome, Brave, Microsoft Edge and Chromium in that order
(`/Applications` on macOS, PATH on Linux) and falls back to the default
browser. A General setting "Open in: App window / Browser tab" chooses;
the `ddev desktop` of an already-running daemon obeys it too. When the
page runs in an app window (`display-mode: standalone`) it drops the drawn
title bar, traffic lights and desk background and fills the window; the
Settings gear moves to the filter row so it exists in both modes.

A native window via a webview toolkit was considered and dropped: it
needs cgo and per-platform SDKs, which breaks the stdlib-only daemon and
the cross-compiled release.

**Acceptance:** `ddev desktop` opens a window titled "DDEV Desktop" with
no address bar on Luke's Mac (Chrome installed); switching the setting to
"Browser tab" and running `ddev desktop` again opens a tab in the default
browser with the framed look as before.

---

## Out of scope

- Grouping by folder, pinning, favourites. Search covers most of it.
- Safari and Firefox have no app mode; they get the tab.
- Remembering window size and position: Chrome keeps app-window bounds per
  URL on its own.

## Demo

1. `ddev desktop`: an app window opens. Type "drupal" in the search box;
   pick a type from the dropdown; clear both; click Show all.
2. Settings → General → Open in: Browser tab → OK. Quit, `ddev desktop`
   again: a browser tab with the framed panel.

Last updated: 2026-10-22 by claude
