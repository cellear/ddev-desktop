# Handoff - 2026-10-22 - Sprint 3 - claude

## Models Used This Session

| Task | Model |
|------|-------|
| Sprint 3 doc, check/create/choose endpoints, site dialog, tests, docs | claude-fable-5-1 (Claude Code) |

## What Was Attempted and Outcome

Sprint 3 complete: New Drupal site and Import local site work end to end
from the page.

- `internal/api/create.go`: `GET /api/check` (folder and name pre-flight:
  exists / empty / already a project and its name and type / name taken /
  suggested slug / detected docroot), `POST /api/projects` (server-side
  re-validation, then one job: optional mkdir, `ddev config --auto …` in
  the folder, `ddev start`, optional `ddev composer create-project
  drupal/recommended-project:^N`, optional `ddev import-db --file`),
  `POST /api/choose` (AppleScript folder/file chooser, 204 on cancel),
  `GET /api/features` (tells the page whether a chooser exists). The
  project list used by `check` is cached for 5 s because the dialog calls
  it on every keystroke and `ddev list` took up to 5 s today.
- `ui/src/components/site-dialog.tsx` (new): both dialogs in one component;
  live verdict under the fields; OK disabled until allowed; "Choose…"
  buttons when the daemon reports a chooser; name auto-suggested from the
  folder until the user edits it; fresh-Drupal path explained when the
  folder is missing or empty and the type is a Drupal type.
- `App.tsx`: the new project is selected while its job runs (a `pending`
  ref keeps the selection although the list does not have it yet) so the
  log shows in the panel; "Creating <name>…" heading in that state.

Verified through the API: check verdicts for an existing project folder
(named `duotest2`), a missing folder with a taken name, an empty folder, a
relative path; refusals (409 wrong-name adoption, 409 taken name, 400 empty
folder without create, 400 missing dump); full import of a copy of
`DevDesktop-sites/ddtest` with `ddtest.sql` (type detected as backdrop,
started, 59 tables imported, about 25 s); fresh Drupal 11 in an empty
scratch folder (Composer about 3 min, docroot `web`, installer redirect
answered). In Chrome: the New dialog's verdicts for an already-configured
folder and for a missing folder; screenshot `SCREENSHOTS/sprint-3-new-site-dialog.jpg`.
The native chooser was not driven from Chrome (OS dialog); Luke should try
it in the demo. Scratch projects `dd-import`, `dd-fresh` and the
accidental `dd-empty` were deleted through the API; folders removed.

## What Worked / What Did Not

**Worked**
- `ddev config --auto` with explicit flags needs no interaction and detects
  the CMS type from the code.
- One job for config + start + composer + import reads naturally in the
  log; Composer's progress bars arrive as separate lines.

**Did not / fixed**
- First version accepted an empty folder without `create` (my refusal test
  created a `dd-empty` project). Server now refuses it; the dialog already
  did.
- "Checking…" rendered red because the colour followed the previous
  verdict; fixed.
- The imported copy of `ddtest` answers 500: its `settings.php` still
  includes Acquia Dev Desktop's `loc_*_dd.inc`. Not a panel problem; noted
  in `DOC/ddev-notes.md` for a migration note in the README later.
- `ddev list -j` took about 5 s at one point today (was 1–2 s). The page
  polls it every 10 s. Worth watching; see open questions.

## Current State

- Sprints 1–3 done; `make build && bin/ddev-desktop` works; tests pass.
- No remote configured; Luke pushes.
- Real projects untouched. duotest2 and dropsuite running, backdrop-duo2
  stopped, as before.

## Open Questions

- Polling cost: with 119 projects `ddev list -j` is 1–5 s every 10 s.
  Options: longer interval, poll only when the window is focused (already
  only when visible), or Docker events. Decide in sprint 4 or 5.
- "New Drupal site" offers only Drupal via Composer. Backdrop and WordPress
  have their own installers/zips; out of scope unless Luke wants them.
- The dialog's project-type list is a curated subset of what ddev accepts.

## Files Created or Modified

- `internal/api/create.go` (new), `internal/api/api.go` (routes, list cache fields)
- `ui/src/components/site-dialog.tsx` (new), `ui/src/App.tsx`, `ui/src/lib/ddev.ts`
- `DOC/sprints/sprint-3.md` (new), `DOC/ddev-notes.md`, `README.md`
- `SCREENSHOTS/sprint-3-new-site-dialog.jpg`

## Follow-ups during acceptance (same day)

- Favicon: DDEV's `apple-touch-icon.png` replaces the Lovable `favicon.ico`.
- "New site…": creation generalised through `internal/api/recipes.go`
  (`recipeFor(type)` → before/after steps around config and start).
  Drupal via Composer as before; WordPress via `ddev wp core download`;
  Joomla via download of `https://www.joomla.org/latest` + unzip in Go +
  `.ddev/php/joomla.ini`. Dialog texts come from `CREATE_RECIPES` in
  `ui/src/lib/ddev.ts`; Joomla added to `PROJECT_TYPES`. Verified on a
  private daemon: WordPress 7.1.3 and Joomla 6.2.0 created in about 22 s
  each, installers answered; scratch projects deleted.
- Learned: Docksal's vhost-proxy owns ports 80/443 here, so DDEV's router
  is on 33000/33001. `ddev describe` URLs are right; port-80 checks are not.
- Sprint 3 open question "only Drupal via Composer" is resolved for
  WordPress and Joomla. Remaining types import only.

## Acceptance

Luke ran the sprint 3 acceptance tests on 2026-10-22, including the native
Choose… buttons, and the WordPress/Joomla follow-up: "Worked great."
Sprint 3 accepted.

## Next

Sprint 4: Settings. Ports and TLD through `ddev config global`; panel
settings file `~/.ddev-desktop/settings.json` (default PHP, terminal app,
start-on-launch, stop-on-quit); Config tab Edit buttons; Logs tab streaming
`ddev logs`. Write `DOC/sprints/sprint-4.md` first. Remember the hosts-file
note for a custom TLD.
