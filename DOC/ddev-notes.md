# Working with the ddev CLI from a daemon

What we learned driving `ddev` (v1.25.4) from a Go process with no terminal.
Read this before adding a new ddev call to `internal/ddev`.

## JSON output

- `--json-output` (`-j`) prints one JSON object per log line. The payload
  is the object with a `raw` key: an array for `ddev list`, an object for
  `ddev describe`. `ParseJSON` in `internal/ddev` scans for it.
- Fatal errors are logged as `{"level":"fatal","msg":...}` on **stderr**
  with exit status 1. `runJSON` parses stderr too so the error the page
  sees is the message, not the JSON.
- `ddev list -j` fields used: `name`, `status`, `status_desc`, `type`,
  `approot`, `shortroot`, `docroot`, `httpurl`, `httpsurl`, `primary_url`,
  `mailpit_url`, `mailpit_https_url`. Statuses seen on this machine:
  `running`, `stopped`, `paused`, `.ddev/config.yaml missing`. A project
  whose config is missing has an empty `type` and `describe` fails for it.
- `ddev describe <name> -j` adds `php_version`, `webserver_type`,
  `nodejs_version`, `hostname`, `dbinfo{database_type, database_version,
  dbname, ...}` and `services{web,db,xhgui,...}{status, full_name, image,
  host_ports, ...}`. A project with `omit_containers: [db]` has an empty
  `dbinfo` and no `db` service.
- `ddev list` orders case-sensitively (uppercase names first) and carries
  no timestamps. ddev rewrites `<approot>/.ddev/.ddev-docker-compose-full.yaml`
  on every start, so its mtime is "last started"; `config.yaml`'s mtime is
  the fallback for a project never started. `List()` sorts most recently
  used first, then by name, and the page shows the first 20 of that.
- Fixtures: `testdata/list.json` (first 20 projects of this machine),
  `testdata/describe-running.json`, `testdata/describe-stopped.json`.

## Environment

Every ddev call runs with `DDEV_NONINTERACTIVE=true`, `NO_COLOR=1` and
`TERM=dumb` added to the daemon's environment.

- `DDEV_NONINTERACTIVE=true` stops ddev from prompting. One consequence
  shows in the start log: "Not trying to add hostnames to hosts file
  because DDEV_NONINTERACTIVE=true". ddev would otherwise ask for sudo to
  edit `/etc/hosts`. `*.ddev.site` resolves to 127.0.0.1 through public
  DNS, so sites work without the hosts entry while online. A custom TLD or
  offline use would need `ddev hostname` run by the user in a terminal.
  Remember this for sprint 3 (new sites) and sprint 4 (TLD setting).
- `ddev start` output is plain text, one line per step, suitable for
  streaming. It takes 5–10 s for a project whose images are built, minutes
  for a first start.
- `ddev stop` on an already-stopped project exits 0.
- A project directory that has been duplicated (two names, one path) makes
  ddev print a warning at the top of every command's output. Harmless, and
  the page shows it like any other line.

## Commands used by the site panel (sprint 2)

- `ddev config --php-version X` acts on the current directory, so the
  daemon runs it with `cmd.Dir = approot` (`StreamIn`). It only rewrites
  the keys given; nothing else in config.yaml changes. The new version takes
  effect at the next start, so the daemon follows it with `ddev restart`
  when the project is running.
- `ddev export-db <name> --gzip=false` writes plain SQL to stdout and
  progress to stderr; the daemon pipes stdout straight into the HTTP
  response. It fails when the project is stopped or has no db container,
  so the daemon checks describe first and answers 409.
- `ddev delete <name> -y [-O]` removes containers, volumes and built
  images and leaves the code and `.ddev/` alone. Without `-O` it first
  writes a snapshot to `.ddev/db_snapshots/`.
- Terminal launching: Terminal and iTerm2 accept a command through
  AppleScript (`do script` / `write text`). Warp has no such verb; `open -a
  Warp <dir>` opens a tab in the folder and the user types `ddev ssh`.

## Creating and importing (sprint 3)

- `ddev config --auto --project-name N [--project-type T] [--php-version P]
  [--docroot D]` in the folder. With no type it detects (it found Backdrop
  from a copied codebase and fixed up its `settings.php` to include
  `settings.ddev.php`). Running it on a folder that already has
  `.ddev/config.yaml` merges the given flags into the existing config.
- `ddev composer create-project drupal/recommended-project:^11` runs inside
  the (started) project and needs the folder to be empty apart from
  `.ddev/`. About 3 minutes on this machine; its progress bars arrive as
  separate lines, which the log panel shows fine. Docroot is `web`; the
  daemon passes `--docroot web` to config beforehand.
- `ddev import-db N --file=<path> --no-progress` accepts .sql, .sql.gz,
  .tar(.gz/.bz2/.xz), .tgz and .zip. The dump must be readable by the
  daemon's user; it is streamed into the db container by ddev.
- A codebase copied from an Acquia Dev Desktop site (settings.php that
  includes Dev Desktop's `loc_*_dd.inc`) imports and starts but answers
  500 until that include is removed. Not the panel's business; worth a
  README note for people migrating.
- `osascript` `choose folder` / `choose file` under `tell application
  "System Events"` brings the dialog to the front; the user cancelling
  gives exit status 1 with `-128` in stderr.

## Timings seen

| Command | Time |
|---|---|
| `ddev list -j` with 119 projects | about 1–2 s |
| `ddev describe -j` | under 1 s |
| `ddev start` (images already built, no db) | 6–8 s |
| `ddev stop` | 3–5 s |
| `ddev config` + `ddev start` + `import-db` (2 MB dump) | about 25 s |
| `ddev composer create-project drupal/recommended-project:^11` | about 3 min |

The page polls `ddev list` every 10 s while visible. With 119 projects
that is noticeable CPU; a future sprint could watch Docker events instead.

Last updated: 2026-10-22 by claude
