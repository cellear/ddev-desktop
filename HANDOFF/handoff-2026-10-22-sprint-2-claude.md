# Handoff - 2026-10-22 - Sprint 2 - claude

## Models Used This Session

| Task | Model |
|------|-------|
| Sprint 2 doc, server handlers, UI wiring, tests, docs | claude-fable-5-1 (Claude Code) |

## What Was Attempted and Outcome

Sprint 2 complete: every control on the site panel does its real thing.
Also, between sprints, Luke asked for the 20 most recently used projects
instead of the first 20 alphabetically; done as its own commit (see
`DOC/ddev-notes.md`, "last used").

- `internal/api/actions.go`: `POST .../php` (config + restart when
  running), `POST .../delete` (`ddev delete -y [-O]`), `POST .../reveal`
  (`open <approot>`), `POST .../terminal` (AppleScript for Terminal and
  iTerm2; `open -a Warp <dir>` for Warp; `x-terminal-emulator` on Linux),
  `GET .../export-db` (streams `ddev export-db --gzip=false` as a download,
  409 when stopped or without a db container).
- `internal/ddev`: `StreamIn` (run in a directory; `ddev config` acts on
  the cwd) and `Output` (stdout to a writer, flushed per write).
- `ui/src/lib/ddev.ts`: one `job()` helper for all long commands;
  `setPhp`, `remove`, `revealCode`, `openTerminal`, `exportUrl`.
- `ui/src/App.tsx`: PHP dropdown live, code path is a link that opens
  Finder, terminal button live, Export is a download link when possible,
  Remove dialog with a "keep a database snapshot" checkbox (default on,
  hidden when the project has no db), errors from quick actions shown as a
  fading notice at the bottom, details re-fetched after every job.

Verified through the API on this machine: PHP 8.3 → 8.4 → 8.3 on
`duotest2` with restarts (`ddev describe` confirmed each time), export of
`dropsuite` (3.4 MB, 140 tables, MariaDB dump header), 409s for a stopped
project and a db-less one, Finder opened, Terminal, iTerm2 and Warp each
opened on `dd-scratch`, and `dd-scratch` (a throwaway `ddev config` in the
scratchpad) deleted with its folder intact. In Chrome: list in last-used
order, dropdown enabled with the right value, Remove dialog rendered and
cancelled. Screenshot: `SCREENSHOTS/sprint-2-remove-dialog.jpg`.

## What Worked / What Did Not

**Worked**
- Describe-first in every action handler: one call gives approot and
  running state and validates the name.
- Streaming the dump straight to the HTTP response; no temp file.
- The job/SSE design from sprint 1 absorbed multi-step jobs (config then
  restart) without change.

**Did not / caveats**
- Warp cannot be told to run a command via AppleScript; it opens a tab in
  the project folder and the user types `ddev ssh`. Documented in the
  button's tooltip only through the sprint doc; worth a line in the README
  when the Terminal setting gets its own help text (sprint 4).
- An export that fails midway cannot change the status code any more;
  the daemon logs it and closes the connection so the browser reports a
  failed download. Acceptable for now.
- `ddev delete` also says "Not trying to remove hostnames from hosts
  file because DDEV_NONINTERACTIVE=true". Harmless.
- The PHP `<select>` was not driven from Chrome in the test (native popup);
  the API path was exercised instead and the dropdown shows the right value.

## Current State

- Sprint 2 stories S2-1, S2-2, S2-3, S2-5 done; S2-4 was done in sprint 1.
- `make build && bin/ddev-desktop` works; `go test ./...` passes.
- No remote configured; Luke pushes.
- Test subjects left as found: duotest2 running on PHP 8.3, dropsuite
  running, backdrop-duo2 stopped. The scratchpad `dd-scratch` folder is
  gone from DDEV (its folder is in the session scratchpad and can be
  ignored).

## Open Questions

- Should Remove default to taking a snapshot (current) or not? Snapshots
  take a few seconds and land in `.ddev/db_snapshots/` inside the code
  folder, which may be a git repo.
- Terminal app choice lives in the page's localStorage until sprint 4
  moves panel settings to `~/.ddev-desktop/settings.json`.

## Files Created or Modified

- `internal/api/actions.go` (new), `internal/api/api.go` (routes)
- `internal/ddev/ddev.go` (`StreamIn`, `Output`, `flushWriter`)
- `ui/src/App.tsx`, `ui/src/lib/ddev.ts` (rewritten)
- `DOC/sprints/sprint-2.md` (new), `DOC/ddev-notes.md`, `README.md`
- `SCREENSHOTS/sprint-2-remove-dialog.jpg`

## Next

Sprint 3: New site and Import dialogs end to end (`ddev config` +
`ddev start` + `ddev import-db`), collision checks, optional native folder
chooser. Write `DOC/sprints/sprint-3.md` first. Remember the
`DDEV_NONINTERACTIVE` hosts-file note for custom TLDs.
