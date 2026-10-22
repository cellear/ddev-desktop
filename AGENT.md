# AGENT.md

Guidelines for AI agents working on **ddev-desktop**. Read this first, then
follow the handoff protocol at the bottom.

---

# Project Overview

ddev-desktop is a **control panel for DDEV projects** in the spirit of the
old Acquia Dev Desktop: a list of local sites on the left, the selected
site's URL, code folder, database and PHP version on the right, Start and
Stop at the bottom.

It is one Go binary. It serves a small React page (built to static files
and embedded in the binary) on 127.0.0.1 and runs the `ddev` command line
on the user's machine for everything it shows or changes. It is installed
and launched like ddev-xdebug-tui and ddev-drush-tui: a DDEV host command
downloads the binary on first use, and `ddev desktop` opens the panel.

The panel contains no Acquia code or branding.

---

# Core Design Philosophy

1. **Simplicity.** One binary, one page, one command.
2. **DDEV is the source of truth.** Everything comes from `ddev list -j`
   and `ddev describe -j`. The panel keeps only its own preferences.
3. **Show the work.** Long commands stream their output to the page. The
   panel never reports a project as running before DDEV does.
4. **Minimal dependencies.** Go standard library on the server side.
   React, Tailwind and two Radix primitives on the page.
5. **Readable code.** The maintainer intends to read every line.

Agents must avoid introducing complexity unless explicitly requested.

---

# Repository Layout

```
cmd/ddev-desktop/        main: flags, server start, browser open
internal/ddev/           runs `ddev`, parses -j output, streams long commands
internal/api/            HTTP handlers (JSON + Server-Sent Events), token check
internal/settings/       panel-owned settings (~/.ddev-desktop/settings.json)
ui/                      React page (Vite SPA); `npm run build` -> ui/dist, embedded
commands/host/desktop    DDEV host command installed by the add-on
install.yaml             DDEV add-on manifest
testdata/                saved `ddev list -j` / `describe -j` output for tests
DOC/                     reference docs (plan, architecture, sprints)
HANDOFF/                 session journals
```

---

# Conventions

- Go: standard library only unless a sprint doc says otherwise. `gofmt`.
- Every `ddev` invocation goes through `internal/ddev`. Handlers never call
  `exec` directly.
- The daemon binds 127.0.0.1 only and requires the per-launch token.
- DDEV add-on files live in the repo WITHOUT a `.ddev/` prefix; host
  command scripts carry `#ddev-generated` on line 2. See
  `DOC/ddev-addon-conventions.md`.
- Sprint docs live in `DOC/sprints/sprint-N.md`. Each story has a status
  line (`[todo]`, `[doing]`, `[done]`, `[dropped]`). Each sprint ends in at
  least one commit that includes its handoff.
- Commits are made by the agent when a sprint (or a clean piece of one) is
  done. Pushing and creating remote repositories is the maintainer's step.

---

# Agent Handoff Protocol

Source: https://github.com/cellear/agent-handoff (v1.1)

## Directories

- `HANDOFF/` — Session journals, chronological
- `DOC/` — Reference docs, persistent knowledge by topic

## Starting a Session

1. Read recent files in `HANDOFF/` (newest first)
2. Read relevant files in `DOC/`
3. Summarize current project state for the user
4. Ask what to work on next

## Ending a Session

Create a handoff document before the session ends.

**File:** `HANDOFF/handoff-[yyyy-mm-dd]-[task]-[author].md`

No spaces in filenames. Examples:
- `handoff-2026-01-20-auth-bug-claude.md`
- `handoff-2026-01-22-review-jane.md`

**Include:**
- What was attempted and the outcome
- What worked, what didn't
- Current state and blockers
- Open questions
- Files created or modified
- References to `DOC/` files and prior handoffs

## Updating DOC Files

When you learn something persistent about the project — architecture
decisions, deploy steps, conventions, known issues — update or create a
relevant file in `DOC/`. Prefer updating existing files over creating new
ones. Add or update a `Last updated: yyyy-mm-dd by [author]` line at the
bottom.
