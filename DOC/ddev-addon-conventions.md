# DDEV Add-on Conventions

Hard-won lessons from Sprint 1. Read this before touching `install.yaml` or command scripts.

## File Structure

Add-on source files that should land in the project's `.ddev/` directory must be
stored WITHOUT a `.ddev/` prefix in the add-on repo. DDEV prepends `.ddev/`
automatically during install.

**Correct:**
```
repo/
  commands/
    host/
      xdebug-tui    ← stored here in repo
  install.yaml
```

`install.yaml`:
```yaml
project_files:
  - commands/host/xdebug-tui   ← no .ddev/ prefix
```

Result in project: `.ddev/commands/host/xdebug-tui` ✓

**Wrong (double .ddev):**
```yaml
project_files:
  - .ddev/commands/host/xdebug-tui  ← DON'T do this
```

Result in project: `.ddev/.ddev/commands/host/xdebug-tui` ✗ (command not found)

## The `#ddev-generated` Signature

Host command scripts must include `#ddev-generated` as the second line (after
the shebang). Without it, `ddev add-on get` refuses to overwrite the file on
reinstall, making iterative development painful.

```bash
#!/usr/bin/env bash
#ddev-generated
## Description: Launch the ddev-xdebug-tui terminal debugger
## Usage: xdebug-tui
exec ddev-xdebug-tui
```

## Reserved Command Names

DDEV has built-in commands and aliases that will shadow custom commands with the
same name. Always check `ddev --help` before naming a custom command.

Known conflicts:
- `debug` — alias for `ddev utility` (this bit us in Sprint 1)
- `d`, `dbg`, `ut` — also aliases for `ddev utility`

Our command is named `xdebug-tui` (`ddev xdebug-tui`).

## Install Command

```bash
# Deprecated (still works but warns):
ddev get /path/to/addon

# Current:
ddev add-on get /path/to/addon
```

Run from the target DDEV project directory, not the add-on repo root.

## Development Reinstall Workflow

1. Make changes to add-on source
2. `make install` (rebuilds and installs binary to `~/go/bin/`)
3. `ddev add-on get ~/Sites/DDEV/ddev-xdebug-client` (from PHP test project dir)
4. `ddev restart` (if changing command scripts)
5. `ddev xdebug-tui`

No uninstall needed between iterations — `ddev add-on get` overwrites files that
have the `#ddev-generated` signature.

Last updated: 2026-03-05 by Claude
