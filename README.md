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
- **Chat live** — steer a running agent from the **terminal UI** _or_ from a floating,
  hidable box injected into the driven page itself. `/stop` interrupts, sending a message
  continues. The agent explores the app by observing and clicking (it does not guess URLs),
  can take screenshots to read a page, and works with nested iframes.
- **Recover** — when a browser window is closed mid-run it reopens on the next action, and
  when a selector drifts the planner is asked for the next action instead of the demo dying.

The AI authenticates through your **Claude Code login** (OAuth) — no key in the repo.

## Status

Green under the full quality gate (unit tests + an opt-in browser integration test):

| Layer                                     | Package        | State                               |
| ----------------------------------------- | -------------- | ----------------------------------- |
| Domain + use-cases + ports (pure, tested) | `@ayd/core`    | ✅ implemented                      |
| Playwright browser driver + overlays      | `@ayd/engine`  | ✅ implemented (+ integration test) |
| Claude Agent SDK planner                  | `@ayd/planner` | ✅ implemented                      |
| Terminal UI (OpenTUI, on Bun)             | `apps/tui`     | ✅ implemented                      |
| Headless/headed runner                    | `apps/cli`     | ✅ implemented                      |

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

## Run (terminal UI)

The shell is a **terminal UI** built on [OpenTUI](https://github.com/anomalyco/opentui), so
it runs on **[Bun](https://bun.sh)** (1.3+). It drives your pre-installed Chrome/Chromium-based
browser, so there is no browser download.

```bash
# once: a Chromium-based browser (Chrome/Edge/Brave/Chromium) and Claude Code, logged in
claude login
pnpm install

cd apps/tui && bun start        # builds the workspace packages, then launches
# bun dev                       # skip the build when dist is already current
```

`bun start` compiles `@ayd/core|engine|planner` to their `dist/` first (the TUI
imports the built packages), so a fresh clone just works. `bun dev` skips that.

Type an instruction and press Enter — the agent opens the browser and drives it live.
Commands (also `/help`):

- `/plan <desc>` compile + run a demo from prose · `/run <path>` run a saved DemoScript
- `/sessions` list past runs · `/view <id>` print one · `/resume <id>` reopen one (the agent re-achieves its prior state, then continues)
- `/memory` the per-app feature-map · `/box` show/hide the in-page chat box
- `/token [value]` store a Claude token **encrypted in the macOS keychain** (else `claude login`)
- `/config` show/edit settings (`set url …` · `set persona <id> <label> <color>` · `rm persona <id>`)
- `/stop` interrupt the agent, or abort a `/plan`/`/run` · `/end` close session · `/quit` (or Ctrl+C) exit

**Profile** (target app + personas): the app runs on generic defaults
(`http://localhost:3000`, an `admin` and a `user` persona) until you point it at your app.
Set `AYD_PROFILE=/path/to/profile.json`, or drop one at `~/.config/ayd/profile.json` or
`config/local/profile.json` (gitignored). Shape: see
[`config/profile.example.json`](config/profile.example.json). It names your target app and
accounts, so it stays machine-local, never committed.

### Run without the UI (CLI, Node)

Same engine, no TUI — good for a quick check or CI:

```bash
pnpm --filter @ayd/engine exec playwright install chromium   # once, if no system Chrome
pnpm --filter @ayd/cli build
node apps/cli/dist/main.js examples/cpv2.demo.json            # headed, two-persona demo
node apps/cli/dist/main.js examples/hello.demo.json --headless
# flags: --headed | --headless | --base-url=URL | --pace=ms
```

## Layout

```
packages/core/    framework-free domain: entities, use-cases, ports. Zero I/O, zero vendor SDKs.
packages/engine/  Playwright adapter — implements the BrowserDriver port + overlays + screenshots.
packages/planner/ Claude Agent SDK adapter — the AI planner + the live interactive agent.
apps/tui/         OpenTUI terminal UI (Bun) — the composition root and live-agent chat.
apps/cli/         headless/headed CLI runner (a second composition root, Node).
examples/         sample DemoScripts.  config/  example of the profile shape.
docs/adr/         architecture decision records.
```

## Contributing

TDD, conventional commits, and the dependency rule (`core` depends on nothing) are
enforced by CI, not review. Start at [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md).
