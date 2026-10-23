# Handoff - 2026-10-22 - Sprint 4 - claude

## Models Used This Session

| Task | Model |
|------|-------|
| Sprint 4 doc, settings/lifecycle/logs/edit endpoints, Settings dialog, tests, docs | claude-fable-5-1 (Claude Code) |

## What Was Attempted and Outcome

Sprint 4 complete: the Settings dialog's four tabs do real things.

- `internal/api/settings.go`: `GET/PUT /api/settings`. Panel settings
  (default PHP for new sites, terminal app, start-on-launch, stop-on-quit,
  verbose) live in `<state-dir>/settings.json`; DDEV's router ports and
  TLD are read with `ddev config global` and written back with the same
  command, only for values that changed. The response also reports the
  ports the router really listens on (from a running project's URLs),
  because DDEV 1.25 substitutes ports when 80/443 are busy (Docksal holds
  them on Luke's machine, so the router is on 33000/33001).
  Lifecycle: `Server.OnLaunch` starts the projects recorded in
  `state.json` when start-on-launch is set (as ordinary jobs);
  `Server.OnQuit` records which panel-started projects are still running
  and, with stop-on-quit, runs `ddev stop` on each (never `poweroff`).
  `main.go` calls them around `Serve`, with a 2-minute budget for quit.
- `internal/api/logs.go`: `GET /api/projects/{name}/logs?service=&tail=`
  streams `ddev logs -f` as SSE until the page disconnects;
  `POST /api/edit` opens `.ddev/config.yaml` (or the global config) in the
  default text editor with `open -t`, or the `.ddev/php` / `.ddev/mysql`
  folder in Finder, creating it when missing.
- `GET /api/jobs` lists unfinished jobs; the page attaches to one on load,
  so a reload during `ddev start` keeps the log, and launch-time starts
  are visible.
- `internal/ddev`: commands run in their own process group and context
  cancel kills the group (`proc_unix.go`), otherwise `docker logs` kept
  the pipe open after `ddev logs` died. `Runner.Verbose` logs every
  invocation with its duration (the Verbose logging setting).
  `Runner.GlobalConfig` parses `ddev config global`.
- `--state-dir` flag on the daemon (default `~/.ddev-desktop`), so a test
  instance can run beside the real one.
- `ui/src/components/settings-dialog.tsx` rewritten: General (terminal,
  the two lifecycle checkboxes with honest labels), Ports (DDEV globals,
  substituted-ports note, hosts-file note for a custom TLD, "OK will run
  ddev config global"), Config (PHP for new sites, Edit/Open buttons,
  global config row), Logs (web/db picker, View/Stop, following pane,
  verbose checkbox). The New/Import dialog preselects the default PHP.

Verified on a private daemon (`--state-dir`, port 8472): GET/PUT
settings; TLD set to `ddev.test` and back (confirmed with `ddev config
global` each time); validation (bad terminal, port 99999); `ddev start
backdrop-duo2` listed by `/api/jobs` while running; web log SSE for 6 s,
process terminated cleanly, none left; Edit opened TextEdit on
duotest2's config.yaml; SIGINT stopped backdrop-duo2 and wrote
`state.json`; relaunch started it again as a job visible in `/api/jobs`.
In Chrome: all four tabs; Logs followed joomla-test1's web log, Stop and
closing the dialog ended the ddev process. Screenshot
`SCREENSHOTS/sprint-4-settings-logs.jpg`.

## What Worked / What Did Not

**Worked**
- `ddev config global` is fast (0.2 s) and its key=value output is trivial
  to parse; passing only changed flags keeps the daemon's writes minimal.
- Process-group kill made `ddev logs -f` clean to cancel.

**Did not / learned**
- Killing only the ddev process left `docker logs` holding the pipe: the
  SSE handler never returned. Fixed with Setpgid + group SIGTERM.
- `ddev config global --project-tld=…` echoes the whole config; the
  settings response carries it as `output`, the page does not show it.
- With four projects running, `ddev list -j` took 4.5–5 s and a failing
  `ddev describe` took 6 s. Verbose logging now shows these timings.

## Current State

- Sprints 1–4 done; `make build && bin/ddev-desktop` works; tests pass.
- No remote; Luke pushes.
- backdrop-duo2 was started by the test daemon and stopped again by its
  quit; Luke's own test projects (joomla-test1, wordpress-713-ddev-desktop,
  d11-ddev-dt-testt, sfdug-df-simplified) untouched. Luke's daemon
  (started before this sprint) is still the old binary until restarted.

## Open Questions

- Polling cost of `ddev list` (now measurable with Verbose logging).
  Options: longer interval, Docker events, or `ddev list` only when the
  window is focused.
- Stop-on-quit only covers projects the panel started. Luke may prefer
  "all running" to match Dev Desktop; one-line change in `OnQuit`.
- The `ddev desktop` host command (sprint 5) will run the daemon in a
  terminal; Ctrl-C there is "quit". A Quit button on the page would be a
  natural addition then.

## Files Created or Modified

- `internal/api/settings.go`, `internal/api/logs.go` (new);
  `internal/api/api.go`, `actions.go`, `create.go`, `jobs.go`
- `internal/ddev/ddev.go`, `internal/ddev/proc_unix.go`,
  `internal/ddev/proc_other.go` (new)
- `cmd/ddev-desktop/main.go`
- `ui/src/components/settings-dialog.tsx` (rewritten),
  `ui/src/components/site-dialog.tsx`, `ui/src/App.tsx`, `ui/src/lib/ddev.ts`
- `DOC/sprints/sprint-4.md` (new), `DOC/ddev-notes.md`, `README.md`
- `SCREENSHOTS/sprint-4-settings-logs.jpg`

## Acceptance

Luke, 2026-10-22: "I love the functionality in the settings, the log files
are great. I didn't test that all the config options work, though I should
before release. However, it's good enough to pass the sprint." Sprint 4
accepted; Luke to try every Config option before a release. On
stop-on-quit Luke is unsure about panel-started-only; left as is, noted
above.

## Next

Sprint 5: ship as an add-on. `commands/host/desktop` (find or download
the binary, run it; copy itself to `~/.ddev/commands/host/` so
`ddev desktop` works anywhere), `install.yaml`, release workflow building
`ui/dist` and the four binaries, README with screenshots. Write
`DOC/sprints/sprint-5.md` first.
