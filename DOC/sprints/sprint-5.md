# Sprint 5: Ship as a DDEV add-on

**Sprint Goal:** `ddev add-on get cellear/ddev-desktop` followed by
`ddev desktop` opens the panel on a machine that has only DDEV, with no Go
or Node installed. Releases are built by GitHub Actions from a tag. The
README tells a newcomer what this is, how to install it, and what to
expect.

Status values: `[todo]` `[doing]` `[done]` `[dropped]`

---

## Stories

### S5-1: Host command
**Status:** [done]
**Owner:** claude

`commands/host/desktop` (`#ddev-generated` on line 2, `## CanRunGlobally:
true` so it works outside a project). It finds the daemon binary: a
`ddev-desktop` on PATH first (development), then
`~/.ddev-desktop/bin/ddev-desktop`; otherwise it downloads
`ddev-desktop-<os>-<arch>` from the latest GitHub release of
`cellear/ddev-desktop` into that folder. `ddev desktop --update` downloads
again. Everything else on the command line is passed to the daemon
(`--port`, `--no-open`, `--limit`). The daemon runs in the foreground;
Ctrl-C is "quit" and triggers stop-on-quit.

**Acceptance:** with the binary removed from `~/.ddev-desktop/bin` and none
on PATH, `ddev desktop` downloads it and opens the browser (needs a
published release; until then the download path is exercised against a
local file URL or verified by reading).

### S5-2: install.yaml
**Status:** [done]
**Owner:** claude

`global_files: [commands/host/desktop]` so the command lands in
`~/.ddev/commands/host/` and `ddev desktop` works from any directory, not
only the project the add-on was installed from. `removal_actions` removes
the downloaded binary but keeps `~/.ddev-desktop/settings.json`.

**Acceptance:** `ddev add-on get <this repo>` from a scratch project puts
the command in `~/.ddev/commands/host/desktop`; `ddev desktop --help`
works from `~`; `ddev add-on remove ddev-desktop` takes the command away.

### S5-3: Versioned release
**Status:** [done]
**Owner:** claude

The release workflow already builds `ui/dist` and the four binaries. Add
the tag as the daemon's version (`-ldflags -X main.version=…`),
`ddev-desktop --version`, and a `checksums.txt` beside the binaries. The
host command prints the version it is running.

**Acceptance:** `make dist` produces four binaries that report the version
given with `VERSION=…`; the workflow file passes `actionlint`-level
sanity by inspection (it cannot run without a remote).

### S5-4: README for release
**Status:** [done]
**Owner:** claude

What it is (with screenshots from each sprint), install in two commands,
what the panel does and does not do (never `ddev poweroff`, only touches
projects you act on, only the 20 most recently started projects for now),
Settings, security model, the Dev Desktop migration note (old
`settings.php` includes), uninstall, development and the handoff process.

**Acceptance:** Luke reads it as a stranger would and finds nothing
missing for a first install.

---

## Out of scope

- Windows: the chooser, terminal launching and `open -t` are macOS/Linux
  only. The host command refuses on other systems with a clear message.
- bats tests in `tests/` as in DDEV's add-on template. Worth adding once
  there is a remote and CI.
- Signing or notarising the macOS binary. A curl download carries no
  quarantine attribute, so Gatekeeper does not block it.

## Demo

1. `cd` to any project, `ddev add-on get ~/Sites/DDEV/ddev-desktop`.
2. `cd ~ && ddev desktop` opens the panel. Ctrl-C quits.
3. `ddev desktop --help` shows the daemon's flags.

Last updated: 2026-10-22 by claude
