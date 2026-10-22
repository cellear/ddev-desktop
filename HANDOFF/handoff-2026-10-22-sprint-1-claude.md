# Handoff - 2026-10-22 - Sprint 1 - claude

## Models Used This Session

| Task | Model |
|------|-------|
| Planning, repo bootstrap, Go daemon, UI conversion, browser test, docs | claude-fable-5-1 (Claude Code) |
| Prototype UI (prior work) | Lovable |

## Context

This project follows three "editions" of the 2020 Acquia Dev Desktop
control panel that Luke and Claude built in `~/Sites/REA/` (desktop-
reanimated, ddev-desktop-reanimated, ddev-desktop-duo). Those drove modern
stacks from the old binary through shell wrappers. The lesson was that the
panel-as-thin-client idea is right but the old binary is the wrong client.
This repo starts over with Luke's Lovable prototype as the page and a Go
daemon as the client of the `ddev` CLI. `DOC/implementation-plan.md` has
the decisions and the five sprints.

## What Was Attempted and Outcome

Sprint 1 complete; demo passed in Chrome.

- Repo bootstrapped at `~/Sites/DDEV/ddev-desktop` with the handoff
  protocol (`AGENT.md`, `CLAUDE.md`, `AGENTS.md`, `.cursorrules`).
  The previous GitHub repo named ddev-desktop was renamed
  `cellear/ddev-desktop-reanimated` by Luke's instruction; the folder
  `~/Sites/DDEV/ddev-desktop` that held May mockups became
  `ddev-desktop-mockups`.
- Lovable prototype (`~/Sites/REA/lovable-ddev-project-porch`) moved into
  `ui/` and cut down to a plain Vite + React single-page app: TanStack
  Start, router, SSR, error reporting and all unused shadcn components
  removed. Kept: `App.tsx` (was `routes/index.tsx`), `settings-dialog.tsx`,
  `button.tsx`, `utils.ts`, `styles.css`. Name/email settings removed.
- `internal/ddev`: `List`, `Describe`, `Stream`, `ParseJSON`, `ValidName`
  with tests against fixtures captured from this machine.
- `internal/api`: token + Host guard, `/api/projects`,
  `/api/projects/{name}`, `POST /api/projects/{name}/{start|stop|restart}`
  → job id, `/api/jobs/{id}/events` (SSE with replay), embedded static page.
- `cmd/ddev-desktop`: free port or `--port`, token, `~/.ddev-desktop/
  daemon.json`, single instance, browser open, clean shutdown on SIGTERM.
- Page: real project list (first 20, sorted case-insensitively), status
  dots, details from describe, Start/Stop with a live log panel, Web and
  Database lights from per-service status, 10 s poll while visible.
- Verified with curl (403 without token or with foreign Host; 302 + cookie
  on first load; list, describe, error message for unknown project; SSE
  stop/start of `duotest2` including late-subscriber replay) and in Chrome
  (started and stopped `backdrop-duo2` from the page; screenshot in
  `SCREENSHOTS/`).

## What Worked / What Did Not

**Worked**
- `ddev list -j` / `describe -j` carry everything the page needs; no
  config.yaml parsing was necessary.
- Job + SSE design: the command keeps running if the page disconnects, and
  a reload mid-start shows the whole log.
- Keeping the prototype's classes and components meant the look survived
  the framework removal unchanged.

**Did not / fixed**
- ddev's fatal messages arrive as JSON on stderr; first version surfaced
  the raw JSON. `runJSON` now parses stderr for the message.
- `DDEV_NONINTERACTIVE=true` means ddev will not touch `/etc/hosts`. Fine
  for `*.ddev.site` (public DNS), a concern for sprints 3 and 4. See
  `DOC/ddev-notes.md`.
- A project with `omit_containers: [db]` has an empty `dbinfo`; the page
  showed "()" until a label for that case was added.
- zsh does not word-split `$VAR` in command position; curl test loops
  needed a shell function. Irrelevant to the product, cost a minute.

## Current State

- `make build && bin/ddev-desktop` works. `go test ./...` passes.
- Nothing is committed to a remote; no remote is configured. Luke pushes.
- The old `duotest2` and `backdrop-duo2` projects were used as test
  subjects and left in the state they were found (duotest2 running,
  backdrop-duo2 stopped).

## Open Questions

- Which 20 projects to show: currently the first 20 by name. Luke is
  thinking about this (119 projects on his machine).
- Whether the sidebar should show `name.ddev.site` (prototype) or just the
  project name; hostnames are long. Sidebar was widened a little.
- Polling `ddev list` every 10 s costs CPU with 119 projects. Docker
  events or a longer interval are options.

## Files Created or Modified

Everything in the repo is new this session. Entry points: `cmd/ddev-desktop/main.go`,
`internal/api/api.go`, `internal/api/jobs.go`, `internal/ddev/ddev.go`,
`ui/src/App.tsx`, `ui/src/lib/ddev.ts`, `ui/embed.go`.

Docs: `DOC/implementation-plan.md`, `DOC/sprints/sprint-1.md`,
`DOC/ddev-notes.md`, `DOC/ddev-addon-conventions.md` (copied from
ddev-xdebug-tui), `README.md`.

## Next

Sprint 2 (`DOC/implementation-plan.md`): PHP dropdown change with
restart, Open Mailpit / Local code / Terminal buttons, Export database as a
download, Remove site. Write `DOC/sprints/sprint-2.md` first.
