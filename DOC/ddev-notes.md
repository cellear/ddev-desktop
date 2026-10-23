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
- Fresh codebases follow DDEV's quickstart recipes
  (https://docs.ddev.com/en/stable/users/quickstart/), in
  `internal/api/recipes.go`:
  - Drupal: `ddev composer create-project` as above (after start).
  - WordPress: `ddev config --project-type wordpress`, start, then
    `ddev wp core download` in the folder (WP-CLI ships in the web
    container). Docroot is the project root. About 20 s.
  - Joomla: download `https://www.joomla.org/latest` (redirects to the
    release zip, 35 MB for 6.2.0), unpack into the folder (files are at the
    zip's top level), write `.ddev/php/joomla.ini` with `display_errors =
    off` and `output_buffering = off` as the quickstart says, then config
    and start. The daemon does the download and unzip itself (net/http +
    archive/zip) so nothing beyond ddev is required. About 20 s.
  - Other types import fine but have no create recipe; the server answers
    400 and the dialog says which types can be created.
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

## Settings and logs (sprint 4)

- `ddev config global` with no flags prints every global as `key=value`,
  one per line, in about 0.2 s. With flags it writes them and prints the
  same listing. Keys use dashes (`router-http-port`, `project-tld`);
  the YAML uses underscores.
- DDEV 1.25 substitutes router ports when the configured ones are busy:
  the router container carries the label
  `com.ddev.router-port-substitutions: 443=33001,80=33000` and every
  project's URLs get the substituted port. The configured values stay
  80/443. The panel shows both (active ports come from a running project's
  URL in `ddev list`).
- `ddev logs -f -s web --tail N <name>` wraps `docker logs -f`. Killing
  only the ddev process leaves `docker logs` holding the output pipe, so
  the runner puts each command in its own process group and kills the
  group on context cancel (`internal/ddev/proc_unix.go`); the stream then
  ends within the 2 s `WaitDelay`. Side effect: Ctrl-C in the daemon's
  terminal no longer reaches child ddev processes, which is what we want
  (a `ddev start` in flight finishes).
- `ddev stop <name>` takes about 3 s; `ddev start` on an already-running
  project is quick and harmless, so start-on-launch does not check first.
- With four projects running, `ddev list -j` took 4.5–5 s and even a
  failing `ddev describe` took 6 s. The polling question stands.
- `open -t <file>` opens the default text editor (TextEdit unless changed);
  `open <folder>` opens Finder.

## Add-on packaging (sprint 5)

- `install.yaml` `global_files:` installs into `~/.ddev/`, so a host
  command listed there becomes `~/.ddev/commands/host/<name>` and works
  from any directory when the script carries `## CanRunGlobally: true`.
  `ddev add-on get` still has to be run inside some project (it records
  the add-on in that project's `.ddev/addon-metadata/`), and `ddev add-on
  remove` from that same project runs `removal_actions` and deletes the
  global file.
- ddev parses a custom command's flags itself from the `## Flags:` JSON
  annotation and rejects anything undeclared ("unknown flag") before the
  script runs. `"Type":"int"` and `"DefValue"` are accepted, so daemon
  flags can be declared purely for pass-through.
- `ddev add-on get` always ends with "Use `ddev restart` to enable …",
  even when nothing in the project changed.
- Host commands inherit the environment, so `DDEV_DESKTOP_BIN=… ddev
  desktop` works as a development override.

## Timings seen

| Command | Time |
|---|---|
| `ddev list -j` with 119 projects | about 1–2 s |
| `ddev describe -j` | under 1 s |
| `ddev start` (images already built, no db) | 6–8 s |
| `ddev stop` | 3–5 s |
| `ddev config` + `ddev start` + `import-db` (2 MB dump) | about 25 s |
| `ddev composer create-project drupal/recommended-project:^11` | about 3 min |
| config + start + `ddev wp core download` (WordPress 7.1.3) | about 22 s |
| Joomla 6.2.0 zip download + unpack + config + start | about 24 s |

On this machine Docksal's `docksal-vhost-proxy` holds ports 80 and 443, so
DDEV's router sits on 33000/33001 and `*.ddev.site` on port 80 answers
"Docksal :: Project missing". Always use the URLs `ddev describe` reports
(the page does).

The page polls `ddev list` every 10 s while visible. With 119 projects
that is noticeable CPU; a future sprint could watch Docker events instead.

Last updated: 2026-10-22 by claude
