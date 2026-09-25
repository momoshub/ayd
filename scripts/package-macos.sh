#!/usr/bin/env bash
# Package the desktop app into a macOS .app + .zip for a GitHub release.
#
# The app drives a pre-installed Chrome/Chromium-based browser at runtime (no
# Playwright browser download), so the bundle ships no browser. It DOES bundle the
# Claude Agent SDK's native runtime, so the artifact is large (~500MB).
#
# The bundle is UNSIGNED. On first open macOS Gatekeeper will block it; a user
# clears quarantine with:  xattr -dr com.apple.quarantine /Applications/ayd.app
#
# Usage:  scripts/package-macos.sh [arch]   (arch: arm64 [default] | x64)
set -euo pipefail

ARCH="${1:-arm64}"
ELECTRON_VERSION="$(node -p "require('./apps/desktop/node_modules/electron/package.json').version")"
VERSION="$(node -p "require('./apps/desktop/package.json').version")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="${TMPDIR:-/tmp}/ayd-deploy"
OUT="${ROOT}/release"

cd "$ROOT"
echo "==> build"
pnpm --filter @ayd/desktop build

echo "==> deploy self-contained app dir (prod deps, pnpm layout preserved)"
rm -rf "$STAGE"
pnpm --filter=@ayd/desktop --prod --legacy deploy "$STAGE"

echo "==> package .app (electron ${ELECTRON_VERSION}, ${ARCH})"
rm -rf "$OUT"
# --no-deref-symlinks keeps pnpm's .pnpm layout so nested deps (e.g. the Claude
# Agent SDK under @ayd/planner) still resolve; dereferencing flattens and breaks it.
pnpm dlx @electron/packager@18.4.4 "$STAGE" ayd \
  --platform=darwin --arch="$ARCH" --electron-version="$ELECTRON_VERSION" \
  --app-bundle-id=com.momos.ayd --app-version="$VERSION" \
  --out="$OUT" --overwrite --no-deref-symlinks --no-prune

APP="$OUT/ayd-darwin-${ARCH}/ayd.app"
ZIP="$OUT/ayd-${VERSION}-darwin-${ARCH}.zip"
echo "==> zip -> $ZIP"
# ditto preserves symlinks + macOS metadata (plain `zip` would break the .pnpm links).
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

echo "done: $ZIP"
du -sh "$APP" "$ZIP"
