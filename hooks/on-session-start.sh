#!/bin/bash
# SessionStart hook: inject compact EdgeOne Makers routing principles.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${EDGEONE_MAKERS_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}}"

node "$PLUGIN_ROOT/hooks/sessionstart-minimal-context.mjs"

