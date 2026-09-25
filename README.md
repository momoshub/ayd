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

Green under the full quality gate (46 unit tests + an opt-in browser integration test):

| Layer                                     | Package        | State                               |
| ----------------------------------------- | -------------- | ----------------------------------- |
| Domain + use-cases + ports (pure, tested) | `@ayd/core`    | ✅ implemented                      |
| Playwright browser driver + overlays      | `@ayd/engine`  | ✅ implemented (+ integration test) |
| Claude Agent SDK planner                  | `@ayd/planner` | ✅ implemented                      |
| Electron shell + control UI               | `apps/desktop` | ✅ implemented (run needs binaries) |

Remaining: recovery on selector drift and polish (P4–P5 in [`docs/architecture.md`](docs/architecture.md)).

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

## Run the app

The app drives real browser windows and (for plan mode) uses your Claude Code login,
so a first run needs the browser binaries beyond `pnpm install`:

```bash
# the browser + Electron binaries (declined at install to keep it light)
pnpm --filter @ayd/engine exec playwright install chromium
pnpm --filter @ayd/desktop exec electron --version   # triggers Electron's binary fetch
# (plan + chat modes also need the Claude Code CLI, logged in: `claude login`)

# build and launch
pnpm --filter @ayd/desktop build
pnpm --filter @ayd/desktop start
```

There is no config file to edit. On first launch the app opens **Settings**, where
you set the target app's base URL and the personas (id, label, colour) in the GUI.
It is saved to your OS user-data dir (never the repo) and reopened from the header
any time. The profile names your target app and accounts, so it stays machine-local.

Then chat with the **Live agent** to drive the open browser (interrupt or steer it
any time), paste a description and hit **Plan & Run**, or paste a `DemoScript` JSON
(see [`examples/hello.demo.json`](examples/hello.demo.json)) and hit **Run Script**.
Live run events stream into the log. Opt-in browser test: `pnpm test:integration`.

### Run without the UI (CLI)

Same engine, no Electron — good for a quick check or CI:

```bash
pnpm --filter @ayd/engine exec playwright install chromium   # once
pnpm --filter @ayd/cli build
node apps/cli/dist/main.js examples/cpv2.demo.json            # headed, two-persona demo
node apps/cli/dist/main.js examples/hello.demo.json --headless
# flags: --headed | --headless | --base-url=URL | --pace=ms
```

## Layout

```
packages/core/    framework-free domain: entities, use-cases, ports. Zero I/O, zero vendor SDKs.
packages/engine/  Playwright adapter — implements the BrowserDriver port + overlays.
packages/planner/ Claude Agent SDK adapter — implements the AiPlanner port.
apps/desktop/     Electron main + renderer — the composition root and control UI.
apps/cli/         headless/headed CLI runner (a second composition root).
examples/         sample DemoScripts.  config/  example of the profile shape (edited in-app, saved to user-data).
docs/adr/         architecture decision records.
```

## Contributing

TDD, conventional commits, and the dependency rule (`core` depends on nothing) are
enforced by CI, not review. Start at [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md).
