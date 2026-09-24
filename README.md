# ayd — automate y_our demo(n)s

An AI-assisted, Playwright-driven **product demo runner**. Describe a demo in plain
English (or hand it a saved script) and `ayd` drives real browser windows —
multiple logged-in personas side by side, a moving pointer, on-screen captions,
success highlights, and a coloured frame per persona so viewers always know who
they're watching.

> **Private and sensitive.** This repository is built to open-source quality but is
> **not** open source. No credentials, staging URLs, or tokens ever live in the repo —
> they stay in gitignored local config. See [`docs/architecture.md`](docs/architecture.md).

## What it does

- **Run a script** — a validated, deterministic step list. This is what you use on a
  live call: repeatable, no surprises.
- **Plan from prose** — hand it a description; the AI planner explores the app and
  _compiles_ a reviewable script, which you then run deterministically.
- **Recover** — when a selector drifts mid-run, the planner is asked for the next
  action instead of the demo dying.

The AI planner authenticates through your **Claude Code login** (OAuth) — no separate
API key required.

## Status

Foundation in place and green under the full quality gate:

| Layer                                     | Package        | State          |
| ----------------------------------------- | -------------- | -------------- |
| Domain + use-cases + ports (pure, tested) | `@ayd/core`    | ✅ implemented |
| Playwright browser driver + overlays      | `@ayd/engine`  | ⏳ planned     |
| Claude Agent SDK planner                  | `@ayd/planner` | ⏳ planned     |
| Electron shell + control UI               | `apps/desktop` | ⏳ planned     |

See the phase plan in [`docs/architecture.md`](docs/architecture.md).

## Quickstart

```bash
corepack enable            # use the pinned pnpm
pnpm install
pnpm check                 # typecheck (TS7 / tsgo) + lint + test
```

Per-task scripts:

| Command                         | What                                     |
| ------------------------------- | ---------------------------------------- |
| `pnpm check`                    | the whole gate — run before every commit |
| `pnpm typecheck`                | TS7 native typecheck (`tsgo -b`)         |
| `pnpm test` / `pnpm test:watch` | vitest                                   |
| `pnpm lint` / `pnpm lint:fix`   | eslint (flat config, type-aware)         |
| `pnpm format`                   | prettier                                 |

## Layout

```
packages/core/    framework-free domain: entities, use-cases, ports. Zero I/O, zero vendor SDKs.
packages/engine/  Playwright adapter — implements the BrowserDriver port.        (planned)
packages/planner/ Claude Agent SDK adapter — implements the AiPlanner port.      (planned)
apps/desktop/     Electron main + renderer — the composition root and control UI. (planned)
docs/adr/         architecture decision records.
```

## Contributing

TDD, conventional commits, and the dependency rule (`core` depends on nothing) are
enforced by CI, not review. Start at [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md).
