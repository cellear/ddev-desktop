# Sprint 4: Settings and logs

**Sprint Goal:** the Settings dialog does real things. Its four tabs from the
prototype (General, Ports, Config, Logs) stop being placeholders: panel
preferences live in a file the daemon owns, DDEV's global ports and TLD are
read from and written through `ddev config global`, project configuration
files open in an editor, and container logs stream into the dialog.

Status values: `[todo]` `[doing]` `[done]` `[dropped]`

---

## Stories

### S4-1: Settings API
**Status:** [done]
**Owner:** claude

`GET /api/settings` returns two groups. *Panel* settings come from
`~/.ddev-desktop/settings.json` (default PHP for new sites, terminal app,
start-on-launch, stop-on-quit, verbose). *Global* settings come from
`ddev config global` (router HTTP/HTTPS ports, project TLD) plus the ports
the router is *actually* on, taken from a running project's URLs, because
DDEV 1.25 substitutes other ports when 80/443 are busy (on Luke's machine
Docksal holds them, so the router is on 33000/33001).
`PUT /api/settings` writes the panel file and runs `ddev config global`
for whichever global values changed. The page loads settings from here
instead of localStorage (the per-site https preference stays local).

**Acceptance:** change the terminal app, reload the page: it sticks.
`ddev config global` shows a changed TLD after saving one.

### S4-2: Ports tab
**Status:** [done]
**Owner:** claude

HTTP port, HTTPS port and TLD edit DDEV's global config. The tab explains
that a change applies when a project is next started, and shows the
substituted ports when they differ from the configured ones. A TLD other
than `ddev.site` needs hosts-file entries that the daemon's non-interactive
ddev cannot write; the tab says so. "Revert to defaults" = 80 / 443 /
ddev.site.

**Acceptance:** set TLD to `ddev.test`, OK, `ddev config global` reports it;
revert; it reports `ddev.site` again.

### S4-3: General tab and daemon lifecycle
**Status:** [done]
**Owner:** claude

Terminal app (used by the terminal button), "Start the sites that were
running when DDEV Desktop last quit" and "When quitting, stop the sites
this panel started". The daemon records the projects it started; on
SIGINT/SIGTERM with stop-on-quit it runs `ddev stop` for those still
running (never `ddev poweroff`) and writes their names to
`~/.ddev-desktop/state.json`; on launch with start-on-launch it starts
them as ordinary jobs. `GET /api/jobs` lists the active jobs so the page
attaches to them on load (which also fixes losing a job's log on reload).

**Acceptance:** start a project from the panel, Ctrl-C the daemon: the
project stops. Launch again: it starts, and its log shows in the panel.

### S4-4: Config tab
**Status:** [done]
**Owner:** claude

"PHP for new sites" (panel setting; the New/Import dialog preselects it).
Per project: Edit opens `.ddev/config.yaml` in the default text editor
(`open -t` on macOS, `xdg-open` elsewhere); Open opens the `.ddev/php/`
and `.ddev/mysql/` folders in the file manager, creating them when
missing (DDEV reads `*.ini` / `*.cnf` from them). One more row for
`~/.ddev/global_config.yaml`. The dialog explains that a changed file takes
effect at the next restart.

**Acceptance:** Edit opens TextEdit (or the default editor) on the file;
Open shows the folder in Finder.

### S4-5: Logs tab
**Status:** [done]
**Owner:** claude

`GET /api/projects/{name}/logs?service=web|db&tail=200` streams
`ddev logs -f -s <service> --tail 200 <name>` as Server-Sent Events for as
long as the page listens; closing the dialog ends the ddev process. The
tab shows the last lines and follows. The Drupal/Backdrop dblog link stays.
"Verbose logging" makes the daemon log every ddev invocation with its
duration to its own stderr (useful for the polling-cost question).

**Acceptance:** View on a running project's web log shows nginx lines
appearing as the site is hit; Stop ends the stream; the ddev process is gone.

---

## Out of scope

- Per-project `ddev config` options (webserver type, database, Node.js,
  xdebug): Edit the config file instead.
- Docker events instead of polling. Still open; verbose logging will show
  what the polling costs.
- Windows paths.

## Demo

1. Settings → General: switch Terminal to iTerm2, OK; terminal button
   opens iTerm2. Reload: still iTerm2.
2. Settings → Ports: shows 80/443 configured and 33000/33001 in use.
3. Settings → Config: Edit on a project's config.yaml opens it; Open on
   `.ddev/php/` shows Finder.
4. Settings → Logs: View web log of a running site, hit the site, lines
   arrive.
5. Start a site, quit the daemon with Ctrl-C (stop-on-quit on): site
   stops. Start the daemon: site comes back, log visible.

Last updated: 2026-10-22 by claude
