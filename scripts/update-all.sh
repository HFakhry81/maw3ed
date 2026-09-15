#!/usr/bin/env bash
# Convenience wrapper for a full Maw3ed update + smoke + mobile.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node scripts/update-targets.js all "$@"
