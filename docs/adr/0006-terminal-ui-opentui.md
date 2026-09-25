# 6. Terminal UI on OpenTUI, replacing the Electron shell

Date: 2026-09-25

## Status

Accepted. Supersedes [ADR 0003](0003-electron-shell-playwright-engine.md)'s Electron shell.

## Context

The shell was an Electron desktop app (`apps/desktop`). In practice it was heavy: a
~500MB unsigned package, Gatekeeper friction, and packaging pain in a pnpm + ESM +
Playwright monorepo. The value it added over the terminal was small, because the demo
itself plays out in a **separate, real browser window** the agent drives — the control
surface only needs to stream the agent transcript and take a line of input.

Clean architecture made the shell swappable: `core`, `engine`, and `planner` are
UI-agnostic; only the composition root and control UI were Electron-specific.

## Decision

Replace the Electron shell with a **terminal UI** built on
[OpenTUI](https://github.com/anomalyco/opentui) (`@opentui/core`), in a new `apps/tui`
package. OpenTUI's native core needs **Bun 1.3+** (or Node 26.4+ with `--experimental-ffi`);
the repo runs Node 24, so the TUI runs on **Bun**. `core`/`engine`/`planner` stay on Node
for typecheck and tests; `apps/tui` imports their built output and runs under Bun.

`apps/cli` remains the second, headless composition root (Node).

The profile (target app + personas) moves from the Electron user-data dir to a plain
gitignored JSON file resolved from `AYD_PROFILE`, `~/.config/ayd/profile.json`, or
`config/local/profile.json`. The Electron `safeStorage` token cache is dropped; the AI
uses the user's Claude Code OAuth login.

## Consequences

- No packaging, no code signing, no ~500MB artifact. `cd apps/tui && bun start`.
- A new runtime split: the TUI is Bun-only. Anything the TUI imports must run under Bun
  (Playwright and the Claude Agent SDK do).
- Features that lived only in the Electron renderer (in-app Settings, a Sessions browser,
  a memory viewer) are not yet rebuilt in the TUI; the live-agent chat is. They return as
  TUI views or CLI subcommands as needed.
- Electron is gone from the dependency tree and the `no-restricted-imports` guard for the
  core now guards against the UI shell generally.
