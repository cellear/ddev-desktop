# Sprint 3: New and Import

**Sprint Goal:** a site can be created and imported from the panel, end to
end. "Import local site…" turns an existing codebase (and optionally a
database dump) into a running DDEV project. "New Drupal site…" does the
same for an existing codebase, or creates a fresh Drupal codebase with
Composer into an empty folder. Nothing runs until the dialog has checked
the folder and the name.

Status values: `[todo]` `[doing]` `[done]` `[dropped]`

---

## Stories

### S3-1: Pre-flight check
**Status:** [done]
**Owner:** claude

`GET /api/check?approot=<path>&name=<name>` expands `~`, and reports:
folder exists / is empty, whether it already holds `.ddev/config.yaml`
(and that project's name and type), whether the name is already in
`ddev list`, a suggested name (slug of the folder, de-duplicated) and a
detected docroot (`web`, `docroot`, `htdocs`, `public` when present). The
dialog calls it as the user types and shows the verdict under the fields;
OK is disabled until the verdict allows it.

**Acceptance:** typing a folder that is already a project names the
project; a taken name says so; an empty folder is allowed only for a Drupal
type (Composer create) and explained.

### S3-2: Create / import job
**Status:** [done]
**Owner:** claude

`POST /api/projects` with `{approot, name, type, php, docroot, dump,
create}` validates everything again server-side and starts one job:

1. `mkdir -p` the folder when `create` is set (fresh Drupal).
2. `ddev config --auto --project-name N [--project-type T]
   [--php-version P] [--docroot D]` run in the folder.
3. `ddev start N`.
4. When `create`: `ddev composer create-project drupal/recommended-project:^11`
   (`^10` for drupal10; unpinned for `drupal`).
5. When `dump` is given: `ddev import-db N --file=<dump>`.

The page selects the new project while the job runs so the log shows in
the panel; the sidebar picks it up on the next refresh.

**Acceptance:** import `~/Sites/REA/DevDesktop-sites/duotest` under a new
name with its dump; the site answers. Create a fresh Drupal 11 in an empty
folder; the installer answers. Both from the page.

### S3-3: Collision handling
**Status:** [done]
**Owner:** claude

Covered by S3-1's check and S3-2's server-side re-validation: a taken name
or a folder that is already another project returns 409 with a message
before anything runs. A folder that already has `.ddev/config.yaml` under
the *same* name is accepted (config is merged, project starts).

**Acceptance:** the two refusals show as a message in the dialog, not as a
job.

### S3-4: Native folder and file chooser (macOS)
**Status:** [done]
**Owner:** claude

`POST /api/choose {"kind":"folder"|"file"}` runs AppleScript `choose
folder` / `choose file` and returns the POSIX path, or 204 when the user
cancels. "Choose…" buttons next to the codebase and dump fields use it.
Not available on Linux (button hidden when the daemon reports no chooser).

**Acceptance:** picking a folder fills the field and triggers the check.

---

## Demo

1. More → Import local site… → Choose… → pick `DevDesktop-sites/duotest`;
   name `duotest3`; database: import `DevDesktop-sites/ddtest.sql`; OK. Log
   shows config, start, import; site opens.
2. + → New Drupal site… → an empty folder under `~/Sites/REA/`; type
   drupal11; OK. Log shows Composer creating the project; Open in browser
   lands on the Drupal installer.
3. Type the folder from step 1 again: the dialog says it is already
   `duotest3`.

Last updated: 2026-10-22 by claude
