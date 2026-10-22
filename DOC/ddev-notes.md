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
- `ddev list` orders case-sensitively (uppercase names first). We sort
  case-insensitively.
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

## Timings seen

| Command | Time |
|---|---|
| `ddev list -j` with 119 projects | about 1–2 s |
| `ddev describe -j` | under 1 s |
| `ddev start` (images already built, no db) | 6–8 s |
| `ddev stop` | 3–5 s |

The page polls `ddev list` every 10 s while visible. With 119 projects
that is noticeable CPU; a future sprint could watch Docker events instead.

Last updated: 2026-10-22 by claude
