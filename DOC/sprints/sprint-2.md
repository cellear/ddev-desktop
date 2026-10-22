# Sprint 2: The site panel

**Sprint Goal:** every control on the right-hand panel does its real thing.
Changing the PHP dropdown reconfigures and restarts the project, the Local
code path opens in Finder, the terminal button opens a shell inside the
container, Export database downloads a dump, and the − button removes a
project from DDEV.

Status values: `[todo]` `[doing]` `[done]` `[dropped]`

---

## Stories

### S2-1: PHP version change
**Status:** [done]
**Owner:** claude

`POST /api/projects/{name}/php` with `{"version":"8.3"}` starts a job that
runs `ddev config --php-version 8.3` in the project root and, if the project
is running, `ddev restart <name>`. The dropdown is enabled, shows the
describe value, and the log panel shows the job. Versions offered: DDEV's
current list (7.4 … 8.5).

**Acceptance:** change a running project's PHP from the page; `ddev describe`
reports the new version afterwards and the site serves.

### S2-2: Open in browser, Mailpit, Local code, Terminal
**Status:** [done]
**Owner:** claude

- Open in browser and Open Mailpit stay plain links (done in sprint 1).
- Local code path becomes a link: `POST /api/projects/{name}/reveal` runs
  `open <approot>` (macOS) / `xdg-open` (Linux).
- Terminal button: `POST /api/projects/{name}/terminal` with
  `{"app":"Terminal"|"iTerm2"|"Warp"}` opens a window in that app running
  `cd <approot> && ddev ssh`. Terminal and iTerm2 via AppleScript; Warp has
  no scripting for running a command, so it opens a tab in the folder.
  Linux: `x-terminal-emulator`.

**Acceptance:** all three macOS terminals open on this machine; the Finder
window shows the project folder.

### S2-3: Export database
**Status:** [done]
**Owner:** claude

`GET /api/projects/{name}/export-db` streams `ddev export-db <name>
--gzip=false` to the response as `<name>-<yyyymmdd-hhmm>.sql`. 409 when the
project is not running. The page's button is a download link when the
project runs, disabled otherwise.

**Acceptance:** the downloaded file loads with `ddev import-db`.

### S2-4: Web / Database lights from per-service status
**Status:** [done]
**Owner:** claude

Done in sprint 1 as part of S1-5: lights read `services.web` and
`services.db` from describe.

### S2-5: Remove site
**Status:** [done]
**Owner:** claude

The − button and the dialog run `POST /api/projects/{name}/delete` with
`{"snapshot":true|false}` → job `ddev delete <name> -y [-O]`. Snapshot on
by default (DDEV keeps it in `.ddev/db_snapshots/`). The dialog says that the
code folder is never touched and the database is deleted unless a snapshot
is kept. After the job the list refreshes and the next project is selected.

**Acceptance:** remove a scratch project from the page; it is gone from
`ddev list`; its folder is intact.

---

## Demo

1. Select a running project, change PHP 8.3 → 8.4, watch config + restart in
   the log, see the dropdown read 8.4 after the refresh. Change it back.
2. Click the code path: Finder opens the folder. Click the terminal button
   with each terminal app in Settings: a shell opens inside the container.
3. Export database: a `.sql` file lands in Downloads.
4. Create a scratch project with `ddev config` in an empty folder, select it,
   press −, confirm: it leaves the list; folder still there.

Last updated: 2026-10-22 by claude
