# CLAUDE.md

Operating guide for AI agents (and humans) working in **ayd**. Read this first.
`AGENTS.md` is a short pointer to this file.

## What this is

`ayd` runs product demos: it drives real browser windows through Playwright, switching
between multiple logged-in personas, with a pointer, captions, highlights, and a
coloured frame per persona. Demos come from a **script** (deterministic) or are
**planned from prose** by an AI planner, which compiles a reviewable script.

## Golden rules

1. **The dependency rule is law.** `packages/core` depends on **nothing** — no Electron,
   no Playwright, no vendor SDK, no Node built-ins. Side effects enter only through
   **ports** (interfaces in `packages/core/src/ports`). Adapters depend on `core`, never
   the reverse. This is enforced by ESLint (`no-restricted-imports` in `eslint.config.mjs`)
   and by the workspace boundary — a violating import fails `pnpm check`.
2. **TDD.** Write the failing test, then the code. Domain and use-cases are pure and must
   stay 100% unit-testable with the fakes in `packages/core/src/testing`. No test needs a
   real browser or network.
3. **`pnpm check` is the gate.** Typecheck (TS7) + lint + test must pass before any commit.
   Never commit red.
4. **Nothing sensitive in the repo.** No credentials, staging URLs, tokens, or real demo
   accounts — ever. They live in gitignored local config (`.env`, `config/local/`) or, for
   the desktop profile, the OS user-data dir (edited in-app Settings). The AI planner uses
   the user's Claude Code OAuth, not a committed key.

## Commands

```bash
pnpm install
pnpm check          # typecheck (tsgo, TS7) + lint + test — run before committing
pnpm typecheck      # tsgo -b   (TS7 native)
pnpm typecheck:tsc  # tsc -b    (5.9, drives emit + the ESLint/vitest ecosystem)
pnpm test:watch     # TDD loop
pnpm lint:fix
pnpm format
```

## Architecture (clean, ports & adapters)

```
apps/desktop  ─┐  (composition root: wires adapters to use-cases; Electron + UI)
packages/engine ─┼─▶ implement ports defined in ─▶  packages/core  (domain + use-cases)
packages/planner ┘
```

- **Domain** (`core/src/domain`): `DemoScript`, `Step` (the action vocabulary), `Selector`,
  `Persona`, `RunReport`, `Result`. Pure data + pure functions (`parseDemoScript`,
  `describeSelector`). No throwing for expected failures — return `Result`.
- **Ports** (`core/src/ports`): `BrowserDriver`, `Presenter`, `Clock`. The only way the
  application reaches the outside world.
- **Application** (`core/src/application`): use-cases like `runScript` — orchestrate the
  domain through ports. `runScript` is resilient: a failing step is recorded and the run
  continues (a demo degrades, it doesn't halt).
- **Adapters** (planned): `engine` implements `BrowserDriver` with Playwright + overlays;
  `planner` implements the AI planner with the Claude Agent SDK; `apps/desktop` implements
  `Presenter` over Electron IPC and is the composition root.

Full rationale + the compile-then-run pattern: [`docs/architecture.md`](docs/architecture.md)
and the ADRs in [`docs/adr/`](docs/adr/).

## How to extend

**Add a demo action** (e.g. `scrollTo`):

1. Add the variant to the `Step` union in `core/src/domain/step.ts`.
2. Add its shape to `STEP_SHAPE` in `core/src/domain/demo-script.ts` and a validator test
   in `demo-script.test.ts`.
3. Add a `BrowserDriver` method if it needs one (`core/src/ports/browser-driver.ts`) and
   fake it in `core/src/testing/fakes.ts`.
4. Handle it in `executeStep` in `core/src/application/run-script.ts`; add a `runScript` test.
5. `pnpm check`.

**Add an adapter**: create `packages/<name>`, depend on `@ayd/core`, implement the port,
integration-test it. Never import an adapter from `core`.

## Conventions

- TypeScript only, functional style. Explicit return types on exported/public functions;
  inference is fine for locals. Never `any`. `readonly` on domain data.
- `exactOptionalPropertyTypes` is on — build objects with conditional spread, don't assign
  `undefined` to optional fields.
- ESM everywhere; import local files with the `.js` extension (NodeNext).
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Keep commits focused.
- Small files, clear names, comments explain _why_ not _what_.
