# Architecture

`ayd` is a **clean-architecture** (ports & adapters) app. The core is a pure,
framework-free model of "what a demo is and how it runs"; everything that touches the
outside world — a browser, an AI, the screen — is an adapter behind a port.

## The dependency rule

```
        ┌──────────────────────── apps/desktop ────────────────────────┐
        │ Electron main = composition root · renderer = control UI      │
        │ implements Presenter (IPC) · wires the adapters below         │
        └───────────────┬───────────────────────────┬──────────────────┘
                        │ depends on                 │ depends on
              ┌─────────▼─────────┐        ┌─────────▼─────────┐
              │ packages/engine   │        │ packages/planner  │
              │ Playwright driver │        │ Claude Agent SDK  │
              │ + overlays        │        │ planner           │
              │ impl BrowserDriver│        │ impl AiPlanner    │
              └─────────┬─────────┘        └─────────┬─────────┘
                        │ depends on                 │ depends on
                        └───────────┬────────────────┘
                          ┌─────────▼──────────┐
                          │   packages/core    │  depends on NOTHING
                          │  domain · ports ·  │
                          │  use-cases         │
                          └────────────────────┘
```

Dependencies point **inward only**. `core` never imports Electron, Playwright, a vendor
SDK, or even Node built-ins — enforced by ESLint (`no-restricted-imports`) and the
workspace package boundary. This keeps the interesting logic pure and 100% unit-testable
with the fakes in `packages/core/src/testing`, and lets us swap Playwright, the AI vendor,
or the shell without touching the core.

## Core building blocks

- **`Step`** — the demo action vocabulary (`navigate`, `click`, `type`, `highlight`,
  `waitFor`, `expect`, `switchTo`, `caption`). A `DemoScript` is an ordered list of steps
  plus its personas.
- **`Selector`** — a driver-agnostic way to point at an element (`role`, `text`, `testId`,
  `label`, `css`). The Playwright adapter translates it to a locator, so the domain never
  knows about Playwright.
- **`Persona`** — one logged-in actor (id, label, colour). Each gets an isolated browser
  session and a coloured window frame.
- **`parseDemoScript`** — validates untrusted input (hand-written or AI-generated) into a
  `DemoScript`, returning _every_ problem at once (`Result<DemoScript, DemoScriptIssue[]>`).
- **`runScript`** — the use-case. Iterates steps, dispatches each through the
  `BrowserDriver`, emits `RunEvent`s to a `Presenter`, paces via an injected `Clock`, and
  returns a `RunReport`. Resilient: a failing step is recorded and the run continues.

## The compile-then-run pattern

The app supports both a written script and a plain-English description, via three modes:

1. **Run** — execute a validated `DemoScript` deterministically. Use this on a live call.
2. **Plan** — the AI planner explores the target app through the same browser tools and
   _compiles_ a `DemoScript` you can review, edit, and save. Authoring convenience.
3. **Recover** — if a selector drifts during a run, hand the planner the current snapshot
   and the step's intent and let it choose the next action.

This keeps token cost and non-determinism off the critical path: the AI authors, a plain
script performs.

## Phase plan

- **P0 — core** ✅ domain + ports + `runScript`, fully tested. _(done)_
- **P1 — engine + shell** Playwright `BrowserDriver` (windows, isolated persona contexts,
  overlays: pointer, captions, highlights, coloured frames) and an Electron shell that runs
  a script end to end with a live step log. No AI yet.
- **P2 — auth** Claude Code OAuth via the Agent SDK; token in OS keychain (`safeStorage`).
- **P3 — plan mode** browser actions exposed as in-process MCP tools; prose → plan →
  compiled script. Harness locked to `mcp__ayd__*` — no filesystem/bash tools.
- **P4 — recovery** planner picks the next action on selector drift.
- **P5 — polish** window layout, pacing, a script library, import/export.

## Security & sensitivity

The repo is private and built to open-source quality, but carries **no secrets**:

- credentials, staging URLs, and real demo accounts live in gitignored local config
  (`.env`, `config/local/`) or, for the desktop, the OS user-data dir edited in-app: the
  profile, the feature-map/memory, saved conversations, and the Claude Code token
  (encrypted via Electron safeStorage), never in tracked files;
- the AI planner authenticates through the user's Claude Code login (OAuth), so there is no
  API key to store in the repo;
- the token, when cached, uses the OS keychain via Electron `safeStorage`, not a file.
