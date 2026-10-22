# ddev-desktop

A control panel for your [DDEV](https://ddev.com) projects, in the spirit
of the old Acquia Dev Desktop: sites on the left, the selected site's URL,
code folder, database and PHP version on the right, Start and Stop at the
bottom.

![Sprint 1: starting a project](SCREENSHOTS/sprint-1-start-backdrop-duo2.jpg)

It is one Go binary. It serves a small page on 127.0.0.1, opens your
browser on it, and runs the `ddev` command line for everything the page
shows or changes. DDEV stays the source of truth; the panel keeps only its
own preferences.

**Status: sprint 1 of 5.** The page lists your first 20 projects with live
status, shows a project's details, and starts and stops projects while
streaming ddev's output. Everything else on the page is a placeholder that
says which sprint it arrives in. See `DOC/implementation-plan.md`.

## Running it (development)

Requirements: Go 1.25+, Node 22+, DDEV on your PATH.

```
make build          # builds ui/dist, then bin/ddev-desktop
bin/ddev-desktop    # opens http://127.0.0.1:<port>/?token=…
```

Flags: `--port N` (default: a free port), `--no-open`, `--limit N`
(default 20). A second `ddev-desktop` while one is running just opens the
browser on the running one; the daemon's address is in
`~/.ddev-desktop/daemon.json`.

For UI work, start the daemon with `--port 8471 --no-open` and run
`npm run dev` in `ui/`; Vite proxies `/api` to it. Open the Vite URL with
`?token=<token from daemon.json>` once.

## Security

The daemon binds 127.0.0.1 only and refuses any request without the
per-launch token (passed once in the URL, then kept in a cookie) or with a
Host header other than 127.0.0.1 / localhost. Without that, any web page you
visit could run ddev commands through the daemon.

## Installing as a DDEV add-on

Sprint 5. Until then, `make install` puts the binary in `~/go/bin`.

## Development process

This repo uses the [agent handoff protocol](https://github.com/cellear/agent-handoff):
`AGENT.md` for the rules, `HANDOFF/` for session journals, `DOC/` for
reference docs and `DOC/sprints/` for sprint plans.
