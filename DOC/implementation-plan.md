# ddev-desktop: implementation plan

A Dev Desktop-style control panel for DDEV projects. A single Go binary
serves a small web page (the Lovable prototype, rebuilt as a plain Vite
single-page app and embedded in the binary) and drives the `ddev` CLI on
the user's machine. Installed and launched the way ddev-xdebug-tui and
ddev-drush-tui are.

Decisions taken 2026-10-22 with Luke:

- Go backend, one binary, UI embedded with `go:embed`.
- One repo at `~/Sites/DDEV/ddev-desktop`, no Lovable connection. The
  prototype's UI moved in as `ui/` and is trimmed to a plain Vite + React
  single-page app (no TanStack Start, no server rendering, no router).
- Name: ddev-desktop. Command: `ddev desktop` (not a built-in; checked
  against DDEV 1.25.4). The previous GitHub repo of that name was renamed
  to `cellear/ddev-desktop-reanimated`.
- Sidebar shows at most 20 projects for now.
- No name/email settings. Backdrop needs nothing special (DDEV type
  `backdrop`).
- Work is organised in sprints (`DOC/sprints/`). Each sprint ends in at
  least one commit that includes a `HANDOFF/` entry.

## Architecture

```
cmd/ddev-desktop/main.go      flags, start server, open browser
internal/ddev/                 run `ddev` with -j, parse list/describe, stream long commands
internal/api/                  HTTP handlers: JSON + Server-Sent Events, token check
internal/settings/             panel-owned settings file (~/.ddev-desktop/settings.json)
ui/                            the React page (Vite SPA) -> ui/dist embedded
commands/host/desktop          DDEV host command: fetch binary, run it
install.yaml                   add-on manifest
```

Rules the daemon follows:

1. Binds 127.0.0.1 only, on a free port chosen at start (or `--port`).
2. Every request must carry the per-launch token (`?token=` on first load,
   then a cookie). The Host header must be 127.0.0.1 or localhost. Without
   this any web page could `ddev delete` a project through the browser.
3. All state comes from `ddev list -j` and `ddev describe <name> -j`.
   The daemon caches nothing it cannot refresh in one call.
4. Long commands (`start`, `stop`, `config`+`start`, `import-db`, `delete`)
   stream their output as SSE; the page shows the log while it runs and
   refreshes the project when the command exits. No fake delays.
5. One daemon per user. A second `ddev desktop` finds the running one via a
   pid/port file in `~/.ddev-desktop/` and just opens the browser.

## Mapping the prototype to DDEV

| UI element | Source / command |
|---|---|
| Sidebar list, status dot | `ddev list -j` (`name`, `status`, `type`, `approot`, `primary_url`); first 20 |
| Local site URL, Use https | `httpurl` / `httpsurl` from list; https toggle is a page preference per project |
| Local code | `approot` (click: `open <approot>` on macOS) |
| Database | `ddev describe -j` → `dbinfo` (type, version, db name) |
| Type | `type` |
| PHP dropdown | `php_version` from describe; change = `ddev config --php-version X` + `ddev restart` |
| Web / Database lights | `status == running`; `services.web` / `services.db` from describe |
| Start / Stop | `ddev start <name>` / `ddev stop <name>` (streamed) |
| Open in browser | `primary_url` in a new tab |
| Open Mailpit | `mailpit_url` from list |
| Export database | `ddev export-db <name> --gzip=false` piped to the response as a download |
| Terminal button | `osascript` to open Terminal/iTerm with `cd <approot> && ddev ssh` |
| + New site | `ddev config --project-root --project-name --project-type --php-version --docroot`, then `ddev start` |
| Import local site | same as new, plus `ddev import-db --file=` when a dump is given |
| − Remove | `ddev delete <name> --omit-snapshot --yes` (code folder kept) |
| Settings: ports, TLD | `ddev config global --router-http-port --router-https-port --project-tld` (read from `~/.ddev/global_config.yaml`) |
| Settings: default PHP, terminal app, start-on-launch, stop-on-quit | panel-owned, `~/.ddev-desktop/settings.json` |
| Settings: Config tab (edit config.yaml, php/, mysql/) | `open -t` the file / folder with the OS default editor |
| Settings: Logs tab | `ddev logs <name>` (tail, streamed) |

Browser file pickers cannot see the user's filesystem, so "Local codebase"
and "Dump file" stay text fields. On macOS the daemon can offer a native
chooser through `osascript -e 'choose folder'`; do that in sprint 3 if the
text field proves annoying.

## Sprints

### Sprint 1: Skeleton that lists real projects

Goal: `go run ./cmd/ddev-desktop` opens a browser tab that shows the
first 20 DDEV projects with live status, and Start/Stop work with streamed
output. Details in `DOC/sprints/sprint-1.md`.

### Sprint 2: The site panel

Goal: every control on the right-hand panel does its real thing: PHP
change with restart, Open in browser, Mailpit, Local code, Terminal,
Export database, Web/Database lights, Remove.

### Sprint 3: New and Import

Goal: a site can be created and imported from the panel, end to end, on a
copy of a real Drupal and a real Backdrop codebase. Collision checks before
anything runs. Optional native folder chooser on macOS.

### Sprint 4: Settings and logs

Ports and TLD via DDEV global config (with a warning that running projects
need a restart). Panel settings file: default PHP, terminal app,
start-on-launch (restarts the projects that were running at last quit),
stop-on-quit (`ddev stop` for projects the panel started, never
`ddev poweroff`). Config tab Edit buttons; Logs tab streaming `ddev logs`.

### Sprint 5: Ship as an add-on

Host command `commands/host/desktop` (find or download the binary, run it;
first run also copies itself to `~/.ddev/commands/host/` so `ddev desktop`
works from any directory). `install.yaml`. Release workflow that builds
`ui/dist` and the four binaries (darwin/linux × amd64/arm64) in one job.
README with screenshots.

Later, not planned: menu bar app or Wails window instead of a browser tab;
more than 20 projects (search, pinning, grouping by folder); snapshots;
xdebug on/off; launching ddev-drush-tui and ddev-xdebug-tui from the panel.

## Lessons carried from the Dev Desktop editions

- The panel must never claim a service is up before it is. The old panel
  went green when Apache answered while containers were still pulling
  images. Here Start stays "Starting…" until `ddev start` exits 0 and
  `ddev list -j` says running.
- Show the command output. Every confusing moment in the editions was a
  wrapper doing something invisible.
- Restarting everything on every change was the old panel's habit. Only
  the changed project is restarted here.
- Test sites: `~/Sites/REA/DevDesktop-sites/` has Drupal and Backdrop
  codebases with dumps that worked for every edition.

Last updated: 2026-10-22 by claude
