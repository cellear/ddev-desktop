# Sprint 1: Skeleton that lists real projects

**Sprint Goal:** `go run ./cmd/ddev-desktop` opens a browser tab showing the
first 20 DDEV projects on this machine with their live status. Selecting a
project shows its URL, code folder, type and PHP version. Start and Stop
run the real commands and show their output as it happens.

Status values: `[todo]` `[doing]` `[done]` `[dropped]`

---

## Stories

### S1-1: Repository bootstrap
**Status:** [done]
**Owner:** claude

Repo at `~/Sites/DDEV/ddev-desktop`, `main` branch. `AGENT.md` with the
handoff protocol, `CLAUDE.md` / `AGENTS.md` / `.cursorrules` pointing to it,
`DOC/implementation-plan.md`, this file, `.gitignore`, `go.mod`
(`github.com/cellear/ddev-desktop`), `Makefile` and release workflow in the
shape of ddev-drush-tui.

**Acceptance:** `go build ./...` succeeds with the empty skeleton.

### S1-2: UI as a plain Vite single-page app
**Status:** [done]
**Owner:** claude

The Lovable prototype moved into `ui/`. Remove TanStack Start, the router,
server entry, error reporting and the unused shadcn components. Keep
`routes/index.tsx` (renamed `App.tsx`), `settings-dialog.tsx`, `button.tsx`,
`utils.ts` and `styles.css`. Add `index.html`, `main.tsx`, a minimal
`vite.config.ts` (react + tailwind) and a slim `package.json`.

**Acceptance:** `npm install && npm run build` in `ui/` produces `ui/dist`
and the page renders with the mock adapter unchanged.

### S1-3: `internal/ddev`: list, describe, stream
**Status:** [done]
**Owner:** claude

`List(ctx)` runs `ddev list -j` and returns `[]Project` (name, status,
type, approot, shortroot, httpurl, httpsurl, primary_url, mailpit_url).
`Describe(ctx, name)` adds php_version, database type/version/name, and
per-service status. `Stream(ctx, w, args...)` runs a ddev command and
writes each output line to a callback until it exits, returning the exit
error. `ddev` is located on PATH; `--json-output` parsing tolerates the
`raw` wrapper DDEV uses.

**Acceptance:** unit tests pass against fixtures in `testdata/` captured
from this machine (trimmed to 20 projects, paths kept).

### S1-4: `internal/api`: JSON and SSE endpoints with token check
**Status:** [done]
**Owner:** claude

- `GET  /api/projects` → first 20 projects
- `GET  /api/projects/{name}` → describe
- `POST /api/projects/{name}/start|stop|restart` → starts the command as a
  background job and returns `{job: id}`
- `GET  /api/jobs/{id}/events` → `text/event-stream`: every output line so
  far (so a late or reloaded page sees the whole log), new lines as they
  arrive, then an `exit` event with `{ok, error}`. Finished jobs are kept
  for 10 minutes.
- Static files from the embedded `ui/dist` at `/`
- Middleware: Host must be `127.0.0.1:*` or `localhost:*`; every request
  carries the token as `?token=` (first load, sets a cookie) or as the
  cookie. Anything else is 403.

**Acceptance:** `curl` without the token gets 403; with it, the project
list matches `ddev list -j`.

### S1-5: Page talks to the daemon
**Status:** [done]
**Owner:** claude

Replace the mock in `ui/src/lib/ddev.ts` with a client of the same shape
using `fetch` and `EventSource`. Status dots from the real list. Start and
Stop show a log area under the buttons while the command runs and refresh
the project when it exits. Settings stay local for this sprint.

**Acceptance:** stopping and starting a real project from the page works
and the sidebar dot follows.

### S1-6: Binary: embed, port, browser, single instance
**Status:** [done]
**Owner:** claude

`go:embed ui/dist`. Pick a free port unless `--port` is given. Generate
the token, write `~/.ddev-desktop/daemon.json` (pid, port, token), open
`http://127.0.0.1:<port>/?token=…` with `open` (macOS) / `xdg-open`
(Linux). On start, if `daemon.json` names a live daemon, open its URL and
exit. `--no-open` for development.

**Acceptance:** run twice; the second run reuses the first daemon. Quit the
daemon and `daemon.json` is gone.

---

## Demo

1. `make build && bin/ddev-desktop`
2. Browser opens; sidebar lists up to 20 projects with dots
3. Select a stopped project, press Start, watch the log, dot turns green
4. Press Stop, dot goes grey
5. Run `bin/ddev-desktop` again in another terminal: same tab, no second daemon

Last updated: 2026-10-22 by claude
