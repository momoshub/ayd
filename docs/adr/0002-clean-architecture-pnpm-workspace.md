# 2. Clean architecture in a pnpm workspace

Date: 2026-09-24

## Status

Accepted

## Context

The demo runner has a small amount of interesting logic (what a demo is, how a run
proceeds) and a lot of volatile I/O (a browser, an AI vendor, a desktop shell). We want the
logic pure and testable, and the I/O swappable.

## Decision

Clean architecture (ports & adapters), with the dependency rule enforced physically by a
pnpm workspace:

- `packages/core` holds the domain, use-cases, and ports and declares **no** runtime
  dependencies.
- Adapters (`packages/engine`, `packages/planner`) and the shell (`apps/desktop`) depend on
  `@ayd/core` and implement its ports. Nothing depends inward-out.
- ESLint `no-restricted-imports` blocks Electron / Playwright / vendor SDK / Node built-ins
  inside `core`, so a wrong import fails `pnpm check`, not review.

## Consequences

The core is 100% unit-testable with in-memory fakes — no browser or network in tests.
Swapping Playwright, the AI vendor, or the shell is a new adapter, not a rewrite. Cost: more
package boundaries and a little wiring in the composition root (`apps/desktop`).
