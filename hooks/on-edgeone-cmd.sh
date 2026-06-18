#!/bin/bash
# PreToolUse hook: when running edgeone CLI commands, ensure PAGES_SOURCE is set
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Check if PAGES_SOURCE is missing from the command
if echo "$COMMAND" | grep -q "edgeone" && ! echo "$COMMAND" | grep -q "PAGES_SOURCE"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: "Running edgeone CLI command. Ensure PAGES_SOURCE=skills is set (export PAGES_SOURCE=skills or prefix the command)."
    }
  }'
else
  exit 0
fi
