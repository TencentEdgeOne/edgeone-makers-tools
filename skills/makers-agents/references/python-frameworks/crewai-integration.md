# Route E: CrewAI — Integration & Review

> Continues [crewai.md](crewai.md). Read that first for runtime conventions and the core pattern.

## Tool integration (context.tools)

Once `edgeone.json` sets `agents.framework: 'crewai'`, `context.tools` returns CrewAI `BaseTool` instances:

```python
async def handler(context):
    # ⭐ Must use to_crewai_tools to get real CrewAI BaseTool instances
    from crewai import BaseTool
    tools = context.tools.to_crewai_tools(BaseTool)

    crew = Crew(
        agents=[Agent(role="...", tools=tools, llm=llm)],
        tasks=[...],
    )
```

> Use `ctx.tools.to_crewai_tools(BaseTool)` to get real CrewAI `BaseTool` instances. This injects the CrewAI class at call time so the toolkit doesn't depend on CrewAI directly.

---

## Route E review checklist

- [ ] `edgeone.json` sets `agents.framework` (`crewai` or `langgraph` for hybrid)
- [ ] `requirements.txt` exists and versions align with the platform's bundled lib
- [ ] LLM construction uses `provider="openai"` (bypassing LiteLLM)
- [ ] `LLM` / Crew / OpenAI client use a module-level singleton + env fingerprint reset
- [ ] env is read solely from `context.env`; **never from `os.environ`** (frontend code is exempt)
- [ ] Crew has `memory=False` + `verbose=False` (events go through event_bus, nothing on stdout)
- [ ] `crew.kickoff()` is wrapped in `asyncio.to_thread` (does not block the event loop)
- [ ] event_bus bridges `LLMStreamChunkEvent` → SSE `ai_response` and `TaskCompletedEvent` → `tool_result`
- [ ] SSE frame format `data: <JSON>\n\n` + 5-second `ping` heartbeat + closing `[DONE]`
- [ ] AbortSignal: Python uses `context.request.signal.is_set()` (not `.aborted`)
- [ ] `/stop` calls `context.utils.abort_active_run(conversation_id)` (snake_case)
- [ ] Memory API uses snake_case: `store.append_message(conversation_id=..., ...)` / `store.get_messages(conversation_id=...)`
- [ ] `/stop` reads body only — **no** `makers-conversation-id` header
- [ ] Templates that use the `web_search` tool have `WSA_API_KEY` configured
- [ ] ⭐ Frontend calls this endpoint with the `makers-conversation-id` header (the frontend is TypeScript, identical to the TS routes)

---

## Frontend call example (frontend is TS, identical to other routes)

```typescript
// Frontend code example
const conversationId = getOrCreateConversationId();   // UUID cached in localStorage

const resp = await fetch('/email/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'makers-conversation-id': conversationId,         // ⭐ required
  },
  body: JSON.stringify({ task: 'daily_digest' }),
});

// /stop (NEVER include the header)
await fetch('/email/stop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id: conversationId }),
});
```

---

## Quick comparison vs. A/B/C/D

| Dimension | TS routes (A/B/C/D) | **Python route (E)** |
|------|------|------|
| Language | TypeScript | **Python** |
| Runtime config | `agents.framework` | `agents.framework` |
| Entry signature | `export async function onRequest(context)` | **`async def handler(context):`** |
| Naming style | camelCase | **snake_case** |
| Memory API | `store.appendMessage({ conversationId, role, content })` | **`await store.append_message(conversation_id=..., role=..., content=...)`** |
| Abort | `signal.aborted` | **`signal.is_set()`** |
| Stream orchestration | SDK-built-in or hand-written | event_bus bridge + asyncio.Queue + asyncio.to_thread |
| Multi-agent | C's Handoff / D's subAgents | **Crew + Process.sequential / hierarchical** |
| Built-in memory option | None | CrewAI's own `memory=True` (typically replaced by ctx.store) |
| Skill loading | None | `Crew(skills=[dir])` loads local SKILL.md |
| LiteLLM compatibility trap | None | ⭐ `provider="openai"` is mandatory (platform has no LiteLLM) |

---

## Common pitfalls

1. **`provider="openai"` not set** → CrewAI dispatches via LiteLLM, which is absent on the platform and will crash outright
2. **`crew.kickoff()` not wrapped in `asyncio.to_thread`** → blocks the event loop and stalls all SSE heartbeats
3. **`verbose=True` not flipped to False** → CrewAI logs to stdout and may corrupt the SSE stream
4. **`memory=True` enabled while also using `ctx.store`** → double-write, state desync
5. **Reading env via `os.environ.get("AI_GATEWAY_API_KEY")` directly** → must read from `context.env` (the platform-injected path)
6. **Python `.is_set()` written as `.aborted`** → AbortSignal never fires
7. **Calling `store.append_message` with camelCase** → wrong name, AttributeError
8. **`requirements.txt` not pinned, or grossly diverging from the bundled platform versions** → dependency conflicts and failed deployment

See also:
- 
- Route B (Claude Agent SDK): `../node-frameworks/claude-sdk.md`
- Route C (OpenAI Agents SDK): `../node-frameworks/openai-agents.md`
- Route D (LangGraph + DeepAgents): `../node-frameworks/langgraph.md`
- Platform conventions: `../platform/node-entry.md`
- Sandbox & tools: `../capabilities/sandbox.md`
- Memory store: `../capabilities/store.md`
- Review checklist: `review-checklist.md`
