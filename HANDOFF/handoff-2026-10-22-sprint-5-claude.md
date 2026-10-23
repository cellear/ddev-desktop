# Handoff - 2026-10-22 - Sprint 5 - claude

## Models Used This Session

| Task | Model |
|------|-------|
| Sprint 5 doc, host command, install.yaml, versioning, README | claude-fable-5-1 (Claude Code) |

## What Was Attempted and Outcome

Sprint 5 complete: ddev-desktop is packaged as a DDEV add-on.

- `install.yaml`: `global_files: [commands/host/desktop]`, so the command
  lands in `~/.ddev/commands/host/` and `ddev desktop` works from any
  directory. `post_install_actions` prints the next step;
  `removal_actions` deletes `~/.ddev-desktop/bin` (settings kept).
  `ddev_version_constraint: '>= v1.23.0'`.
- `commands/host/desktop`: `#ddev-generated`, `## CanRunGlobally: true`.
  Finds the daemon in this order: `$DDEV_DESKTOP_BIN` (dev override),
  `ddev-desktop` on PATH, `~/.ddev-desktop/bin/ddev-desktop`; else
  downloads `ddev-desktop-<os>-<arch>` from the latest GitHub release
  (macOS/Linux, amd64/arm64) and reports the version it installed.
  `--update` re-downloads. All other flags pass through to the daemon.
- Daemon: `--version` flag; `main.version` set with `-ldflags` by
  `make build`/`make dist` (git describe) and by the release workflow
  (`$GITHUB_REF_NAME`). `make dist` and the workflow also write
  `checksums.txt`. Startup line now says the version and "Ctrl-C to quit".
- README rewritten for a stranger: install in two commands, what it does,
  good-to-know (DDEV is source of truth, 20 projects, substituted ports,
  custom TLD, Dev Desktop migration note), security, uninstall,
  development, releases.

Verified on this machine: `ddev add-on get <working copy>` from a scratch
project installed the command globally and `ddev --help` lists `desktop`
as a "global shell host container command"; `ddev desktop --version`,
`--port 8473 --no-open --limit 5` passed through (the daemon answered
"already running" because Luke's instance was up, which is the intended
single-instance behaviour); with no binary and no release yet, `ddev
desktop` fails with "download failed. See …/releases"; `ddev add-on
remove ddev-desktop` removed the command and the bin folder and kept
settings. `make dist` built four binaries (7–8 MB each) and checksums.
Scratch project `dd-addon-test` deleted and its folder removed; the add-on
is not left installed.

## What Worked / What Did Not

**Worked**
- `global_files` in install.yaml does exactly what a global tool needs; no
  copy-itself step required (the plan's earlier idea is dropped).
- DDEV's custom-command `## Flags:` annotation accepts `"Type":"int"` and
  `"DefValue"`, so daemon flags can be declared for pass-through.

**Did not / learned**
- Without declaring them, ddev's cobra parser rejects `--port`,
  `--version` etc. with "unknown flag" before the script runs. Every
  pass-through flag must appear in `## Flags:`.
- `ddev add-on get` always prints "Use `ddev restart` to enable …"; the
  post-install message says no restart is needed.
- `ddev add-on get` needs a project directory even for a global-only
  add-on; the README says "from inside any DDEV project".

## Current State

- All five sprints done. No remote yet; Luke pushes and tags. The first
  `git tag v0.1.0 && git push --tags` produces the release that both
  `ddev add-on get cellear/ddev-desktop` and the host command's download
  rely on; until then the add-on must be installed from the working copy
  with `DDEV_DESKTOP_BIN` or `make install`.
- Luke's daemon (restarted on the sprint 4 build) is running; nothing of
  his was changed.

## Open Questions

- bats tests under `tests/` as in DDEV's add-on template, once CI exists.
- Checksum verification in the host command (checksums.txt is produced;
  the script does not check it yet).
- Luke still to try every Config-tab option before a release (sprint 4).
- Stop-on-quit semantics (panel-started only) still Luke's call.
- Polling cost of `ddev list`; Verbose logging shows the numbers.

## Files Created or Modified

- `install.yaml`, `commands/host/desktop` (new)
- `cmd/ddev-desktop/main.go`, `Makefile`, `.github/workflows/release.yml`
- `README.md` (rewritten), `DOC/sprints/sprint-5.md` (new), `DOC/ddev-notes.md`

## Next

Luke: create the GitHub repo, push, tag `v0.1.0`, wait for the release
workflow, then on a clean shell: `ddev add-on get cellear/ddev-desktop &&
ddev desktop`. After that, the follow-ups above.
