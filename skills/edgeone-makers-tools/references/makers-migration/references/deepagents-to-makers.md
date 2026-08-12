# Migration: DeepAgents (Node + Python) → EdgeOne Makers

DeepAgents is a thin layer over LangGraph, so the migration is almost identical to LangGraph: swap the model endpoint, drop custom tools for `context.tools`, and replace the HTTP server with an `onRequest` handler. Memory reuses the LangGraph adapters.

---

## Node

### ❌ Before — native DeepAgents (Express + direct OpenAI)

```typescript
// server.ts
import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { createDeepAgent } from 'deepagents';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const app = express();
app.use(express.json());

const model = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' });

// Custom tool implemented by hand
const internetSearch = tool(
  async ({ query }: { query: string }) => `results for ${query}`,
  { name: 'internet_search', schema: z.object({ query: z.string() }) },
);

const agent = createDeepAgent({
  model,
  systemPrompt: 'You are a helpful research assistant.',
  tools: [internetSearch],
  maxTurns: 30,
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;
  const stream = await agent.stream(
    { messages: [{ role: 'user', content: message }] },
    { streamMode: 'messages' },
  );
  res.setHeader('Content-Type', 'text/event-stream');
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(3000);
```

### ✅ After — Makers agent handler

```typescript
// agents/chat/index.ts
import { ChatOpenAI } from '@langchain/openai';
import { createDeepAgent } from 'deepagents';
import { tool } from '@langchain/core/tools';
import { createSSEResponse, sseEvent } from '../_shared';

const MODEL_NAME = '@makers/deepseek-v4-flash';

function getModel(env: Record<string, string>) {
  return new ChatOpenAI({
    model: MODEL_NAME,
    apiKey: env.AI_GATEWAY_API_KEY,                 // ⭐ AI Gateway
    configuration: { baseURL: env.AI_GATEWAY_BASE_URL },
    temperature: 0,
    timeout: 300_000,
  });
}

let _agent: any = null;
function getAgent(model: any) {
  if (_agent) return _agent;
  _agent = createDeepAgent({
    model,
    systemPrompt: 'You are a helpful research assistant.',
    tools: [],            // ⭐ platform tools injected automatically via context.tools
    maxTurns: 30,
  });
  return _agent;
}

export async function onRequest(context: any) {
  const { request, env, conversation_id: conversationId } = context;
  const { message } = request?.body ?? {};
  if (!message) return new Response('Missing message', { status: 400 });

  const signal = request?.signal as AbortSignal | undefined;
  const agent = getAgent(getModel(env));

  // ⭐ Platform tools auto-wired; no hand-written tool functions needed.
  // If you need custom tools, wrap them with context.tools.toLangChainTools(tool).

  return createSSEResponse(async function* (sig) {
    const stream = await agent.stream(
      { messages: [{ role: 'user', content: message }] },
      { streamMode: 'messages', signal: sig, configurable: { thread_id: conversationId } },
    );
    for await (const chunk of stream) {
      if (sig?.aborted) break;
      const [msg] = chunk as any[];
      if (msg.tool_call_chunks?.length) {
        for (const tc of msg.tool_call_chunks) if (tc.name) yield sseEvent({ type: 'tool_call', name: tc.name });
      } else if (msg.type === 'tool') {
        yield sseEvent({ type: 'tool_result', name: msg.name, content: msg.text?.slice(0, 500) ?? '' });
      } else if (msg.text) {
        yield sseEvent({ type: 'ai_response', content: msg.text });
      }
    }
    yield 'data: [DONE]\n\n';
  }, signal);
}
```

`edgeone.json`:
```json
{ "agents": { "framework": "deepagents" } }
```

> `deepagents` and all `@langchain/*` packages are auto-externalized — no `externalNodeModules` needed.

---

## Python equivalent

Same `createDeepAgent({ model, systemPrompt, tools, maxTurns })` API. On Makers:

- Entry `async def handler(ctx):`
- `ctx.env["AI_GATEWAY_API_KEY"]` / `ctx.env["AI_GATEWAY_BASE_URL"]`
- Platform tools auto-injected; custom tools via `ctx.tools.toLangChainTools(tool)`
- Memory via `ctx.store.langgraphCheckpointer` / `ctx.store.langgraphStore`
- Stream via `ctx.utils.stream_sse(gen())`
- `buildCommand: ""`, `outputDirectory: ""`

See [makers-agents python-frameworks/deepagents.md](../../makers-agents/references/python-frameworks/deepagents.md).

---

## Conversion Checklist

| Native DeepAgents | Makers |
|-------------------|--------|
| `new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' })` | `new ChatOpenAI({ apiKey: env.AI_GATEWAY_API_KEY, configuration: { baseURL: env.AI_GATEWAY_BASE_URL }, model: '@makers/...' })` |
| Hand-written `tool()` functions | `context.tools.toLangChainTools(tool)` (or leave `tools: []` for auto-injected platform tools) |
| `app.post('/chat', ...)` + manual SSE | `export async function onRequest(context)` + `createSSEResponse(gen, signal)` |
| No persistent memory | `context.store.langgraphCheckpointer` / `context.store.langgraphStore` (optional) |
| `process.env.X` | `context.env.X` |
| `streamMode: 'messages'` (no thread) | `configurable: { thread_id: context.conversation_id }` |
