# Handoff - 2026-10-22 - Sprint 6 - claude

## Models Used This Session

| Task | Model |
|------|-------|
| Sprint 6 doc, search/type filter, app window, docs | claude-fable-5-1 (Claude Code) |

## What Was Attempted and Outcome

Sprint 6 complete: the sidebar is searchable and filterable by type, and
the panel opens in its own window.

- `GET /api/projects` now returns every project (123 here), most recently
  started first, with `limit` as the display hint. The page shows the
  first `limit` when idle, with "20 most recently started of 123 · Show
  all" underneath; a search or a type filter shows every match and says
  how many. Search matches name, hostname and type; the type dropdown
  lists the types present with counts. The selection survives filtering.
- `internal/api/window.go`: `OpenWindow(url, mode, log)`. Mode "app"
  opens a Chromium `--app=URL` window (Google Chrome, Brave, Microsoft
  Edge, Chromium, in `/Applications` on macOS or on PATH on Linux),
  falling back to the default browser; "tab" uses the default browser.
  Both daemon paths (first start and "already running") use it. New
  panel setting `window` (default "app"), in Settings → General as "Open
  in". `--no-open` unchanged.
- The page detects `display-mode: standalone` and then fills the window
  without the drawn title bar, traffic lights or desk background. The
  Settings gear moved into the new search row so it exists in both modes.
- Fixes along the way: the heading over a job for a project not yet in
  the list now follows the job ("Starting backdrop-duo2…", not
  "Creating"); `commands/host/desktop` carries `#ddev-silent-no-warn`
  because `ddev start` otherwise warns about the global command's
  `#ddev-generated` marker on every start.

Verified: a Chrome app window titled "DDEV Desktop" with no address bar
opened on Luke's Mac from the "already running" path and the page filled
it (screen capture checked); in a normal tab the framed look is as
before; typing "back" listed Backdrop projects beyond the recent twenty;
`/api/projects` returned all 123 with the type counts. Test daemon used
`--state-dir` on port 8472 and is stopped; the leftover `state.json` from
sprint 4 made it start backdrop-duo2 once, which its quit stopped again.

## What Worked / What Did Not

**Worked**
- `open -na "Google Chrome" --args --app=URL --window-size=1100,720` hands
  the window to a running Chrome and exits; Chrome shows the page title as
  the window title and remembers the window bounds per URL.
- `matchMedia("(display-mode: standalone)")` is true in a `--app` window.

**Did not / learned**
- A native window (webview toolkit) needs cgo and SDKs; dropped, see
  `DOC/sprints/sprint-6.md`.
- The app window's token cookie belongs to that window's profile; when
  the daemon restarts with a new token the open window shows 403 until
  closed and reopened with `ddev desktop`.

## Current State

- Sprints 1–6 done and committed. No push, no tag; Luke tags `v0.2.0`
  when ready (the release workflow builds from the tag).
- Luke's running daemon is still v0.1.0; `ddev desktop --update` after
  the release, or a local `make install`, gets the new build.

## Open Questions

- Safari or Firefox users get a tab; acceptable for now.
- Polling cost is unchanged (`ddev list` 1–5 s every 10 s); search did
  not change the number of ddev calls.
- Should "Show all" be remembered? Currently per page load.

## Files Created or Modified

- `internal/api/window.go` (new), `internal/api/settings.go`,
  `internal/api/api.go`, `cmd/ddev-desktop/main.go`
- `commands/host/desktop`
- `ui/src/App.tsx`, `ui/src/lib/ddev.ts`, `ui/src/components/settings-dialog.tsx`
- `DOC/sprints/sprint-6.md` (new), `DOC/ddev-notes.md`, `README.md`

## Next

Luke's pick. Candidates: checksum verification in the host command, a
Quit button, bats tests, polling via Docker events, stop-on-quit
semantics.
