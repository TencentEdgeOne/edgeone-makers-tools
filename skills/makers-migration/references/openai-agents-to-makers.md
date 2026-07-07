# Migration: OpenAI Agents SDK (`@openai/agents`) → EdgeOne Makers

OpenAI Agents SDK has no special server format — it runs anywhere Node runs. The migration is about: routing the model through AI Gateway, replacing hand-built tools with `context.tools.all()`, swapping hand-managed history for `openaiSession`, and mapping SDK stream events to Makers SSE.

---

## Node

### ❌ Before — native OpenAI Agents SDK (Express + direct OpenAI)

```typescript
// server.ts
import express from 'express';
import OpenAI from 'openai';
import { Agent, run } from '@openai/agents';
import { z } from 'zod';

const app = express();
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const agent = new Agent({
  name: 'Assistant',
  instructions: 'You are a helpful assistant.',
  model: 'gpt-4o',
  tools: [
    {
      name: 'get_weather',
      description: 'Get weather',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => `Weather in ${city} is sunny`,
    },
  ],
});

app.post('/chat', async (req, res) => {
  const { message, history } = req.body;   // ⚠️ caller must maintain history
  const result = await run(agent, message, { stream: true });
  res.setHeader('Content-Type', 'text/event-stream');
  for await (const ev of result.toStream()) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);   // raw SDK events, not Makers SSE
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(3000);
```

### ✅ After — Makers agent handler

```typescript
// agents/chat/index.ts
import OpenAI from 'openai';
import { Agent, run, OpenAIChatCompletionsModel, type Session } from '@openai/agents';
import { createSSEResponse, sseEvent } from '../_shared';

const DEFAULT_MODEL = '@makers/hy3-preview';

export async function onRequest(context: any) {
  const message = (context.request.body ?? {}).message as string | undefined;
  if (!message) return new Response(JSON.stringify({ error: "'message' is required" }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });

  const signal = context.request.signal as AbortSignal | undefined;
  const env = (context.env ?? {}) as Record<string, string | undefined>;

  // ⭐ OpenAI-compatible client → AI Gateway
  const client = new OpenAI({ apiKey: env.AI_GATEWAY_API_KEY, baseURL: env.AI_GATEWAY_BASE_URL });
  const model = new OpenAIChatCompletionsModel(client, env.AI_GATEWAY_MODEL ?? DEFAULT_MODEL);

  // ⭐ context.tools.all() returns OpenAI function tools directly
  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You are a helpful assistant.',
    tools: context.tools.all(),
    model,
  });

  // ⭐ Session auto-prepends history — no hand-managed messages array
  const session: Session | undefined =
    context.store && context.conversation_id
      ? context.store.openaiSession(context.conversation_id)
      : undefined;

  return createSSEResponse(async function* () {
    try {
      const result = await run(agent, message, { stream: true, signal, session });
      for await (const ev of result.toStream()) {
        if (signal?.aborted) break;
        const sse = toSseEvent(ev);
        if (sse) yield sseEvent({ type: sse.event, ...sse.data });
      }
    } catch (e) {
      const err = e as Error;
      if (err.name !== 'AbortError' && !signal?.aborted) {
        yield sseEvent({ type: 'error_message', content: err.message });
      }
    }
    yield 'data: [DONE]\n\n';
  }, signal);
}

// ⭐ Map SDK stream events to Makers SSE protocol
function toSseEvent(e: any) {
  if (e.type === 'raw_model_stream_event' && e.data?.type === 'output_text_delta') {
    return { event: 'ai_response', data: { content: e.data.delta as string } };
  }
  if (e.type === 'run_item_stream_event' && e.name === 'tool_called') {
    const n = e.item?.name ?? e.item?.rawItem?.name;
    if (n) return { event: 'tool_call', data: { name: n } };
  }
  if (e.type === 'run_item_stream_event' && e.name === 'tool_output') {
    const n = e.item?.name ?? e.item?.rawItem?.name;
    const out = e.item?.output ?? e.item?.rawItem?.output;
    return { event: 'tool_result', data: { name: n, content: typeof out === 'string' ? out.slice(0, 500) : JSON.stringify(out).slice(0, 500) } };
  }
  if (e.type === 'agent_updated_stream_event') {
    return { event: 'tool_call', data: { name: `handoff:${e.agent?.name}` } };
  }
  return null;
}
```

`edgeone.json`:
```json
{ "agents": { "framework": "openai-agents-sdk" } }
```

> Unlike `deepagents` / `@langchain/*` / `claude-agent-sdk`, `@openai/agents` and `openai` are **not** auto-externalized. If you hit `Dynamic require` / `Cannot find module` build errors, add `"externalNodeModules": ["openai", "@openai/agents"]` to the `agents` config.

---

## Python equivalent

Native `@openai/agents` (Python) uses `Agent` + `Runner.run()`. On Makers:

- Entry `async def handler(ctx):`
- `ctx.env["AI_GATEWAY_API_KEY"]` / `ctx.env["AI_GATEWAY_BASE_URL"]`
- `ctx.tools.all()` for tools
- `ctx.store.openai_session(conversation_id)` — note Python method name
- Stream via `ctx.utils.stream_sse(gen())`, mapping `output_text_delta` → `ai_response`, `tool_called` → `tool_call`
- `buildCommand: ""`, `outputDirectory: ""`

See [makers-agents python-frameworks/openai-agents.md](../../makers-agents/references/python-frameworks/openai-agents.md).

---

## Conversion Checklist

| Native OpenAI Agents SDK | Makers |
|--------------------------|--------|
| `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` | `new OpenAI({ apiKey: env.AI_GATEWAY_API_KEY, baseURL: env.AI_GATEWAY_BASE_URL })` |
| `model: 'gpt-4o'` | `new OpenAIChatCompletionsModel(client, env.AI_GATEWAY_MODEL ?? '@makers/...')` |
| Hand-written `tools: [{ name, parameters, execute }]` | `context.tools.all()` (OpenAI function format) |
| Caller maintains `history` array | `context.store.openaiSession(conversation_id)` auto-prepend |
| Raw SDK events over SSE | Map `output_text_delta` → `ai_response`, `tool_called` → `tool_call`, `tool_output` → `tool_result` |
| `app.post('/chat', ...)` | `export async function onRequest(context)` + `createSSEResponse(gen, signal)` |
| `process.env.X` | `context.env.X` |
