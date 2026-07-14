---
name: makers-migration
description: >-
  Migrate existing AI agent projects (LangChain, LangGraph, OpenAI Agents SDK,
  Claude Agent SDK, CrewAI) to EdgeOne Makers platform conventions.
  Use when the user wants to adapt a standard agent project to run on EdgeOne Makers,
  convert Express/Next.js API routes to Makers handlers, or add platform capabilities
  (context.tools, context.sandbox, context.store).
  Do NOT trigger for new agent projects (use makers-agents instead).
metadata:
  author: edgeone
  version: "1.0.0"
---

# EdgeOne Makers Migration Guide

Migrate existing AI agent projects to the **EdgeOne Makers** platform format. Covers structural conversion, API adaptation, and platform capability injection.

---

## Migration Decision Tree

```
What type of project are you migrating?
├── Python project
│   ├── Using CrewAI → See §2 CrewAI
│   ├── Using LangChain/LangGraph/DeepAgents → See §3 LangGraph (Python)
│   ├── Using OpenAI Agents SDK → See §4 OpenAI Agents (Python)
│   └── Using Claude Agent SDK → See §5 Claude SDK (Python)
└── Node/TS project
    ├── Using Express/Next.js API routes → See §6 Express → Makers
    ├── Using LangGraph/DeepAgents → See §3 LangGraph (Node)
    ├── Using OpenAI Agents SDK → See §4 OpenAI Agents (Node)
    └── Using Claude Agent SDK → See §5 Claude SDK (Node)
```

---

## ⚠️  Migration Checklist (common to all frameworks)

Before starting framework-specific changes, check these global items:

- [ ] Create `edgeone.json` with correct `agents.framework` and `buildCommand`/`outputDirectory`
- [ ] Move backend code from Express routes / Next.js API routes into `agents/` directory
- [ ] Replace `process.env` / `os.environ` with `context.env` / `ctx.env`
- [ ] Replace `req.headers.get('x')` with `context.request.headers['x']` (Node) or plain dict access (Python)
- [ ] Replace `await req.json()` with `context.request.body` (already parsed)
- [ ] Replace direct model API calls (OpenAI, Anthropic) with `AI_GATEWAY_*` env vars
- [ ] Add SSE streaming for AI endpoints (replace `res.json()` / `return {"data": ...}`)
- [ ] Add `makers-conversation-id` header to frontend fetch calls
- [ ] Wire platform tools through `context.tools` instead of custom tool implementations
- [ ] Wire conversation history through `context.store` instead of in-memory or custom DB
- [ ] If using web_search, set `WSA_API_KEY` env var and use `context.tools.get("web_search")`
- [ ] Set up `edgeone makers dev` for local development

---

## §1. Standard API Route → Makers Handler

This is the most common migration pattern. Applies to Express/Next.js API routes, plain HTTP handlers, etc.

### Node (Express/Next.js → Makers)

```typescript
// ❌ Before: Next.js API route (app/api/chat/route.ts)
export async function POST(req: Request) {
  const body = await req.json();
  const headers = req.headers;
  const apiKey = process.env.OPENAI_API_KEY;
  // ... LLM call ...
  return Response.json({ data: result });
}

// ✅ After: Makers agent handler (agents/chat/index.ts)
export async function onRequest(context: any) {
  const body = context.request.body;               // already parsed
  const conversationId = context.conversation_id;   // auto-injected from header
  const env = context.env;                          // context.env, never process.env
  // ... LLM call via AI_GATEWAY_* ...
  return new Response(JSON.stringify({ data: result }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Python (Flask/FastAPI → Makers)

```python
# ❌ Before: Flask route
@app.route('/chat', methods=['POST'])
def chat():
    body = request.get_json()
    api_key = os.environ.get('OPENAI_API_KEY')
    # ... LLM call ...
    return jsonify({'data': result})

# ✅ After: Makers agent handler (agents/chat/index.py)
async def handler(ctx):
    body = ctx.request.body
    conversation_id = ctx.conversation_id
    api_key = ctx.env.get("AI_GATEWAY_API_KEY")
    # ... LLM call via AI_GATEWAY_* ...
    return {"data": result}
```

---

## §2. CrewAI (Python)

### Key changes

| Before | After |
|--------|-------|
| `os.environ.get("OPENAI_API_KEY")` | `ctx.env.get("AI_GATEWAY_API_KEY")` |
| `LLM(provider="openai", ...)` — LiteLLM dispatch | `LLM(provider="openai", base_url=ctx.env["AI_GATEWAY_BASE_URL"], ...)` — bypass LiteLLM |
| `memory=True` on Crew | `memory=False` + use `ctx.store` |
| `verbose=True` | `verbose=False` (events go through `crewai_event_bus`) |
| `crew.kickoff()` (blocking) | `await asyncio.to_thread(crew.kickoff)` |
| Custom search tools | Use `ctx.tools.to_crewai_tools(BaseTool)` |
| Flask/FastAPI handler | `async def handler(ctx):` → `ctx.utils.stream_sse(gen())` |

### edgeone.json

```json
{
  "buildCommand": "",
  "outputDirectory": "",
  "agents": {
    "framework": "crewai"
  }
}
```

### Requirements

```txt
crewai>=1.14.5
openai>=1.50.0
```

### Migration steps

1. Replace Flask/FastAPI entry with `async def handler(ctx):`
2. Read env from `ctx.env`, never `os.environ`
3. Use `LLM(provider="openai", api_key=ctx.env["AI_GATEWAY_API_KEY"], base_url=ctx.env["AI_GATEWAY_BASE_URL"])`
4. Set `Crew(memory=False, verbose=False)`
5. Wrap `crew.kickoff()` in `asyncio.to_thread()`
6. Replace custom tools with `ctx.tools.to_crewai_tools(BaseTool)`
7. Return SSE via `ctx.utils.stream_sse(gen())`

> See [makers-agents/skills/python-frameworks/crewai.md](../skills/makers-agents/references/python-frameworks/crewai.md) for the complete pattern.
> Detailed before/after: [references/crewai-to-makers.md](references/crewai-to-makers.md)

---

## §3. LangGraph / DeepAgents (Node + Python)

### Key changes

| Before | After |
|--------|-------|
| Direct model creation (`new ChatOpenAI(...)`) | Use `AI_GATEWAY_*` for apiKey/baseURL |
| `MemorySaver` (in-memory checkpointer) | `context.store.langgraphCheckpointer` (persistent) |
| Custom tool functions | `context.tools.toLangChainTools(tool)` |
| `agent.stream()` | SSE via `createSSEResponse(gen, signal)` (Node) or `ctx.utils.stream_sse(gen())` (Python) |
| `thread_id` manual management | `thread_id = context.conversation_id` |

### Node — edgeone.json

```json
{
  "agents": {
    "framework": "langgraph"
  }
}
```

### Python — edgeone.json

```json
{
  "buildCommand": "",
  "outputDirectory": "",
  "agents": {
    "framework": "langgraph"
  }
}
```

### Migration steps

1. Move handler into `agents/<name>/index.ts` (or `.py`)
2. Replace model initialization: use `AI_GATEWAY_API_KEY` + `AI_GATEWAY_BASE_URL`
3. Replace checkpointer: `context.store.langgraphCheckpointer` instead of `MemorySaver`
4. Replace store: `context.store.langgraphStore`
5. Replace tools: `context.tools.toLangChainTools(tool)` instead of custom tool functions
6. Set `thread_id`: `{ configurable: { thread_id: context.conversation_id } }`
7. Replace response with SSE streaming pattern

> Node: [makers-agents/skills/node-frameworks/langgraph.md](../skills/makers-agents/references/node-frameworks/langgraph.md)
> Python: [makers-agents/skills/python-frameworks/langgraph.md](../skills/makers-agents/references/python-frameworks/langgraph.md)
> DeepAgents: [makers-agents/skills/node-frameworks/deepagents.md](../skills/makers-agents/references/node-frameworks/deepagents.md)
> Detailed before/after: [references/langgraph-to-makers.md](references/langgraph-to-makers.md), [references/deepagents-to-makers.md](references/deepagents-to-makers.md)

---

## §4. OpenAI Agents SDK (Node + Python)

### Key changes

| Before | After |
|--------|-------|
| `new OpenAI({ apiKey, baseURL })` | Read `AI_GATEWAY_*` from `context.env` / `ctx.env` |
| `Runner.run(agent, input, { tools })` | Tools from `context.tools.all()` (already OpenAI function format) |
| Session management | `context.store.openaiSession(convId)` (Node) |
| Express route response | SSE via `createSSEResponse(gen, signal)` (Node) or `ctx.utils.stream_sse(gen())` (Python) |
| Model name hardcoded | `ctx.env.AI_GATEWAY_MODEL || DEFAULT_MODEL` |

### Node — edgeone.json

```json
{
  "agents": {
    "framework": "openai-agents-sdk"
  }
}
```

### Python — edgeone.json

```json
{
  "buildCommand": "",
  "outputDirectory": "",
  "agents": {
    "framework": "openai-agents-sdk"
  }
}
```

### Migration steps

1. Move handler into `agents/<name>/index.ts` (or `.py`)
2. Create OpenAI client from `context.env` (not `process.env`)
3. Replace tools with `context.tools.all()` (returns OpenAI function tools)
4. Use `context.store.openaiSession(conversationId)` for session (Node)
5. Map stream events to SSE: `output_text_delta` → `ai_response`, `tool_called` → `tool_call`

> Node: [makers-agents/skills/node-frameworks/openai-agents.md](../skills/makers-agents/references/node-frameworks/openai-agents.md)
> Python: [makers-agents/skills/python-frameworks/openai-agents.md](../skills/makers-agents/references/python-frameworks/openai-agents.md)
> Detailed before/after: [references/openai-agents-to-makers.md](references/openai-agents-to-makers.md)

---

## §5. Claude Agent SDK (Node + Python)

### Key changes

| Before | After |
|--------|-------|
| `ANTHROPIC_API_KEY` env var | Mapped from `AI_GATEWAY_*` via `collectGatewayEnv()` |
| `process.env` | `context.env` injected into `query().options.env` |
| Custom MCP tools | `context.tools.toClaudeMcpServer()` |
| Session | `context.store.claudeSessionStore()` (Node) |
| Stdout EPIPE crash | Swallow `EPIPE` on `process.stdout` (Node) |
| No writable config dir | Set `CLAUDE_CONFIG_DIR=/tmp/claude-agent-sdk`, `CLAUDE_CODE_TMPDIR=/tmp` |

### Node — edgeone.json

```json
{
  "agents": {
    "framework": "claude-agent-sdk"
  }
}
```

### Python — edgeone.json

```json
{
  "buildCommand": "",
  "outputDirectory": "",
  "agents": {
    "framework": "claude-agent-sdk"
  }
}
```

### Migration steps

1. Move handler into `agents/<name>/index.ts` (or `.py`)
2. Map `AI_GATEWAY_*` → `ANTHROPIC_*` via `collectGatewayEnv(context.env)`
3. Inject env into `query({ options: { env: collectGatewayEnv(...) } })`
4. Replace MCP tools: `context.tools.toClaudeMcpServer('edgeone', { alwaysLoad: true })`
5. Node only: swallow `EPIPE` on `process.stdout`
6. Set writable config dirs: `CLAUDE_CONFIG_DIR=/tmp/claude-agent-sdk`, `CLAUDE_CODE_TMPDIR=/tmp`

> Node: [makers-agents/skills/node-frameworks/claude-sdk.md](../skills/makers-agents/references/node-frameworks/claude-sdk.md)
> Python: [makers-agents/skills/python-frameworks/claude-sdk.md](../skills/makers-agents/references/python-frameworks/claude-sdk.md)
> Detailed before/after: [references/claude-agent-sdk-to-makers.md](references/claude-agent-sdk-to-makers.md)

---

## §6. Express / Next.js API Routes (Node)

General migration for any Express-based or Next.js API route agent.

### The 7-step conversion

| Step | Before | After |
|------|--------|-------|
| 1. File location | `app/api/chat/route.ts` or `server/routes/chat.ts` | `agents/chat/index.ts` |
| 2. Entry signature | `export async function POST(req)` or `app.post('/chat', handler)` | `export async function onRequest(context)` |
| 3. Body parsing | `await req.json()` | `context.request.body` (already parsed) |
| 4. Headers | `req.headers.get('x-foo')` | `context.request.headers['x-foo']` |
| 5. Abort signal | `req.signal` | `context.request.signal` (AbortSignal) |
| 6. Model access | `process.env.OPENAI_API_KEY` → direct call | `context.env.AI_GATEWAY_*` → AI Gateway |
| 7. Response | `res.json()` or `return Response.json()` | SSE stream via `createSSEResponse(gen, signal)` |

### Example: Next.js API route → Makers

```typescript
// ❌ Before: Next.js (app/api/chat/route.ts)
import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: message }],
    stream: true,
  });
  // ... stream back as Response
}

// ✅ After: EdgeOne Makers (agents/chat/index.ts)
import { createLogger, sseEvent, createSSEResponse } from '../_shared';

export async function onRequest(context: any) {
  const { message } = context.request.body ?? {};
  if (!message) return new Response('Missing message', { status: 400 });

  const signal = context.request.signal as AbortSignal;

  return createSSEResponse(async function* (sig) {
    const response = await fetch(context.env.AI_GATEWAY_BASE_URL + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.env.AI_GATEWAY_API_KEY}`,
      },
      body: JSON.stringify({
        model: context.env.AI_GATEWAY_MODEL || '@makers/deepseek-v4-flash',
        messages: [{ role: 'user', content: message }],
        stream: true,
      }),
      signal: sig,
    });
    // ... proxy SSE chunks ...
    yield 'data: [DONE]\n\n';
  }, signal);
}
```

---

## §7. Client-Side Migration

### Frontend fetch calls

```typescript
// ❌ Before: plain fetch without conversation-id
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message }),
});

// ✅ After: with makers-conversation-id header
const conversationId = getOrCreateConversationId(); // crypto.randomUUID() + localStorage
const response = await fetch('/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'makers-conversation-id': conversationId,  // ⭐ required for all AI endpoints
  },
  body: JSON.stringify({ message }),
});
```

### /stop endpoint

```typescript
// ✅ Always pass conversation_id in body for /stop
await fetch('/stop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id: conversationId }),
});
```

### SSE parsing

```typescript
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const event = JSON.parse(data);
        if (event.type === 'ai_response') { /* display text */ }
        if (event.type === 'tool_call') { /* show tool call */ }
        if (event.type === 'ping') { /* ignore heartbeat */ }
      } catch { /* skip non-JSON */ }
    }
  }
}
```

---

## §8. Post-Migration Verification

After migration, verify these items before deploying:

- [ ] `edgeone makers dev` starts without errors
- [ ] `/chat` endpoint returns SSE stream (not JSON)
- [ ] AI responses work end-to-end (frontend → agent → model → frontend)
- [ ] `context.env` is used everywhere (grep for `process.env` / `os.environ` — none should remain)
- [ ] `edgeone.json` has correct `agents.framework`
- [ ] Platform tools (`context.tools`) work in at least one framework
- [ ] Conversation history persists across requests (via `context.store`)
- [ ] `/stop` endpoint cancels active runs
- [ ] Frontend sends `makers-conversation-id` header

---

## See Also

- Agent development guide: [makers-agents/SKILL.md](../makers-agents/SKILL.md)
- Platform conventions: [makers-agents/references/platform/](../makers-agents/references/platform/)
- CLI commands: [makers-cli/SKILL.md](../makers-cli/SKILL.md)
- Deploy guide: [makers-deploy/SKILL.md](../makers-deploy/SKILL.md)

### Detailed before/after reference files

- [references/api-route-to-makers.md](references/api-route-to-makers.md) — generic API route → Makers handler (no-framework fallback; Makers supports framework-less `onRequest`/`handler`)
- [references/langgraph-to-makers.md](references/langgraph-to-makers.md) — LangGraph (Node + Python)
- [references/deepagents-to-makers.md](references/deepagents-to-makers.md) — DeepAgents (Node + Python)
- [references/openai-agents-to-makers.md](references/openai-agents-to-makers.md) — OpenAI Agents SDK (Node + Python)
- [references/claude-agent-sdk-to-makers.md](references/claude-agent-sdk-to-makers.md) — Claude Agent SDK (Node + Python)
