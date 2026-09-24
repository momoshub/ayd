# 5. TypeScript 7 via tsgo, with typescript 5.9 for the ecosystem

Date: 2026-09-24

## Status

Accepted

## Context

We want TypeScript 7. TS7 is the native (Go) compiler. As of this decision, the ecosystem is
mid-migration: `typescript-eslint@8` declares peer `typescript >=4.8.4 <6.1.0`, and vitest's
transform and the TS language service still use the `typescript` JS API. Pinning the
`typescript` package to 7 would break type-aware linting.

## Decision

Author for TS7 and typecheck with the native compiler, while keeping `typescript@5.9` as the
JS-API version the rest of the toolchain consumes:

- **`pnpm typecheck` → `tsgo -b`** (`@typescript/native-preview`, TS7) is the authoritative
  gate. Verified it honours project references and catches real errors, not a no-op.
- **`typescript@5.9`** drives `pnpm build` / `pnpm typecheck:tsc` (emit + a fallback check)
  and is what `typescript-eslint` and `vitest` use.

## Consequences

The project is typechecked under TS7 today, in CI, on every `pnpm check`. `tsgo` is a
preview (`7.0.0-dev`), so it's pinned via the lockfile and the `allowBuilds` entry in
`pnpm-workspace.yaml`. When the stable `typescript@7` package ships a JS API that
`typescript-eslint` and `vitest` support, collapse to a single `typescript@7` and drop the
5.9 pin — no source changes expected, since the code is already TS7-clean.
