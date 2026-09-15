#!/usr/bin/env bash
# Convenience wrapper for a full Maw3ed update + smoke test pass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node scripts/refresh-all.js "$@"
