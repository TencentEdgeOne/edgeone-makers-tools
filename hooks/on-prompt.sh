#!/bin/bash
# UserPromptSubmit hook: detect agent-related prompts and inject skill routing context
set -euo pipefail

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')

# Check if the prompt mentions agent/AI development keywords
if echo "$PROMPT" | grep -qiE 'agent|makers|deepagent|langgraph|crewai|openai.?agents|claude.?sdk|context\.store|context\.tools|context\.sandbox|edgeone.*deploy|SSE.*stream'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "This project uses EdgeOne Makers for AI Agent development. Read skills/makers-agents/SKILL.md for platform conventions, then read the matching framework reference based on the decision tree."
    }
  }'
else
  exit 0
fi
