# AGENTS.md

This repo is AI-first. The full operating guide lives in [`CLAUDE.md`](CLAUDE.md) — read it
before making changes. The essentials:

- **Dependency rule:** `packages/core` imports nothing external (no OpenTUI, Playwright,
  vendor SDK, or Node built-ins). Side effects go through ports. Enforced by ESLint + CI.
- **TDD:** failing test first. Domain + use-cases are pure and fully faked in tests.
- **Gate:** `pnpm check` (TS7 typecheck + lint + test) must pass before every commit.
- **Sensitive:** never commit credentials, staging URLs, tokens, or real demo accounts.

Start reading at `packages/core/src` (domain → ports → application) and
[`docs/architecture.md`](docs/architecture.md).
