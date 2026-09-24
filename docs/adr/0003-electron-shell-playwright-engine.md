# 3. Electron shell over a Node + Playwright engine

Date: 2026-09-24

## Status

Accepted

## Context

We need a desktop app that drives real browser windows: multiple logged-in personas at
once, a moving pointer, captions, highlights, and a coloured frame per persona. A Chrome
extension was considered.

## Decision

Build an **Electron** desktop app whose engine is **Node + Playwright**, driving _separate_
real Chromium windows (not the Electron `BrowserWindow`).

A Chrome extension was rejected:

- it can't run Playwright, and driving pages via `chrome.debugger` shows an intrusive
  "being debugged" banner;
- the demo's core move is switching between two logged-in users at once — Playwright gives
  each an isolated cookie jar with `browser.newContext()`; an extension shares the profile's
  cookies and can't be two users simultaneously without container hacks;
- calling an LLM from an extension leaks the token into extension storage and fights CSP.

## Consequences

The engine is a normal Node/Playwright library (`packages/engine`) behind the `BrowserDriver`
port — reusable and testable independent of Electron. The Electron main process is the
composition root; the renderer is the control UI. If Bun-based shells (e.g. Electrobun)
mature, only `apps/desktop` changes — `core` and `engine` don't.

### Renderer security posture

The control window runs with `contextIsolation: true` and `nodeIntegration: false` — the
load-bearing protections — and talks to the main process only through a small typed IPC
surface (`preload.ts` via `contextBridge`). The Chromium `sandbox` is left **off** because
the preload is ESM (the app is `"type": "module"`) and a sandboxed preload must be CommonJS
and cannot `import './ipc.js'`. The rendered content is local and static (no remote origins,
CSP restricts to `'self'`), so the residual risk is low. To turn the sandbox on, bundle the
preload to a single CommonJS file (e.g. esbuild) first; tracked as a future hardening step.
