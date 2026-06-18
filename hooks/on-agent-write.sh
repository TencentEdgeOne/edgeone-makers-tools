#!/bin/bash
# PreToolUse hook: when writing to agents/ directory, remind about platform rules
set -euo pipefail

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: "Writing to agents/ directory. Ensure: 1) Entry is `export async function onRequest(context)` (Node) or `async def handler(ctx)` (Python). 2) Use context.env, never process.env/os.environ. 3) Use context.conversation_id directly. 4) For tools: Claude SDK uses toClaudeMcpServer(), OpenAI Agents uses all(), LangGraph/DeepAgents uses toLangChainTools(tool), CrewAI uses toCrewAITools(BaseTool)."
  }
}'
