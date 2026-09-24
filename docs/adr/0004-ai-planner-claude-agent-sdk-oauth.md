# 4. AI planner: Claude Agent SDK on Claude Code OAuth, compile-then-run

Date: 2026-09-24

## Status

Accepted

## Context

`ayd` should both run a written script and turn a plain-English description into a demo. The
AI must "decide what to do" using the user's own Claude credentials, not a shared key.

## Decision

- The planner is an adapter behind an `AiPlanner` port, implemented with the **Claude Agent
  SDK**, authenticated through the user's **Claude Code login (OAuth)** — no committed API
  key.
- The demo actions are exposed to the model as **in-process MCP tools** (`mcp__ayd__*`:
  navigate/click/type/highlight/switchTo/expect/caption). The harness is locked to those —
  the SDK's built-in file/bash tools are disallowed, so the planner can only drive the
  browser.
- **Compile-then-run**: the planner explores the target app and emits a reviewable
  `DemoScript`; that script is then run deterministically. A separate _recover_ path asks the
  planner for the next action only when a selector drifts mid-run.

## Consequences

Non-determinism and token cost stay off the critical path of a live demo — the AI authors,
a plain script performs. Uses the user's Claude subscription, no key management. Open
question to confirm against the Agent SDK docs at build time (P2/P3): exactly how a packaged
Electron app obtains the Claude Code OAuth (bundle the `claude` CLI vs. read its stored
credentials) and how to pin the allowed-tools/permission mode. The `AiPlanner` port means if
we ever need an API-key path instead, it's a second adapter, not a rewrite.
