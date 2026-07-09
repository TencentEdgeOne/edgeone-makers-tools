# Migration: LangGraph (Node + Python) → EdgeOne Makers

LangGraph's graph/state API is unchanged on Makers — you only swap three things: model endpoint, checkpointer/store backend, and the HTTP server. This file shows the native format and the exact changes.

---

## Node

### ❌ Before — native LangGraph (Express + in-memory state)

```typescript
// server.ts
import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const app = express();
app.use(express.json());

// 1. Model points directly at OpenAI
const model = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' });

// 2. Custom tool implemented by hand
const getWeather = tool(
  async ({ city }: { city: string }) => `Weather in ${city} is sunny`,
  { name: 'get_weather', schema: z.object({ city: z.string() }) },
);

// 3. In-memory checkpointer — lost on restart, not shared across instances
const checkpointer = new MemorySaver();

function buildGraph(model: any, tools: any[]) {
  const modelWithTools = model.bindTools(tools);
  const toolNode = new ToolNode(tools);
  async function agentNode(state: typeof MessagesAnnotation.State) {
    return { messages: [await modelWithTools.invoke(state.messages)] };
  }
  function shouldContinue(state: typeof MessagesAnnotation.State): 'tools' | '__end__' {
    const last = state.messages[state.messages.length - 1] as any;
    return last.tool_calls?.length ? 'tools' : '__end__';
  }
  return new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent')
    .compile({ checkpointer });
}

const graph = buildGraph(model, [getWeather]);

// 4. Express server builds SSE by hand
app.post('/chat', async (req, res) => {
  const { message, threadId } = req.body;
  const stream = await graph.stream(
    { messages: [{ role: 'user', content: message }] },
    { streamMode: 'messages', configurable: { thread_id: threadId } },
  );
  res.setHeader('Content-Type', 'text/event-stream');
  for await (const chunk of stream) {
    // manual JSON.stringify of each delta...
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
import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createSSEResponse, sseEvent } from '../_shared';

const MODEL_NAME = '@makers/deepseek-v4-flash';

function getModel(env: Record<string, string>) {
  return new ChatOpenAI({
    model: MODEL_NAME,
    apiKey: env.AI_GATEWAY_API_KEY,                 // ⭐ AI Gateway, not OPENAI_API_KEY
    configuration: { baseURL: env.AI_GATEWAY_BASE_URL },
    temperature: 0,
    timeout: 300_000,
  });
}

export async function onRequest(context: any) {
  const { request, env, conversation_id: conversationId, store } = context;
  const { message } = request?.body ?? {};
  if (!message) return new Response('Missing message', { status: 400 });

  const signal = request?.signal as AbortSignal | undefined;

  const model = getModel(env);

  // ⭐ Platform tools become real StructuredTool instances
  const tools = context.tools.toLangChainTools(tool);

  // ⭐ Persistent checkpointer/store from context.store (no MemorySaver)
  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', async (state) => ({ messages: [await model.bindTools(tools).invoke(state.messages)] }))
    .addNode('tools', new ToolNode(tools))
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', (s) =>
      ((s.messages[s.messages.length - 1] as any).tool_calls?.length) ? 'tools' : '__end__')
    .addEdge('tools', 'agent')
    .compile({
      checkpointer: store.langgraphCheckpointer,   // ⭐ persistent
      store: store.langgraphStore,                 // ⭐ long-term KV
    });

  return createSSEResponse(async function* (sig) {
    const stream = await graph.stream(
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
{ "agents": { "framework": "langgraph" } }
```

> All `@langchain/*` packages are auto-externalized — no `externalNodeModules` needed.

---

## Python equivalent

Native LangGraph-Python uses the same `StateGraph`/`MemorySaver`/`tool` API. On Makers:

- Entry becomes `async def handler(ctx):` (file `agents/chat/index.py`)
- `ctx.env["AI_GATEWAY_API_KEY"]` / `ctx.env["AI_GATEWAY_BASE_URL"]` instead of `os.environ`
- `ctx.tools.toLangChainTools(tool)` for tools
- `ctx.store.langgraphCheckpointer` / `ctx.store.langgraphStore` instead of `MemorySaver`
- Stream via `ctx.utils.stream_sse(gen())`
- `buildCommand: ""`, `outputDirectory: ""` in `edgeone.json`

See [makers-agents python-frameworks/langgraph.md](../../makers-agents/references/python-frameworks/langgraph.md).

---

## Conversion Checklist

| Native LangGraph | Makers |
|------------------|--------|
| `new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' })` | `new ChatOpenAI({ apiKey: env.AI_GATEWAY_API_KEY, configuration: { baseURL: env.AI_GATEWAY_BASE_URL }, model: '@makers/...' })` |
| `new MemorySaver()` | `store.langgraphCheckpointer` + `store.langgraphStore` |
| Custom `@tool()` functions | `context.tools.toLangChainTools(tool)` |
| `app.post('/chat', ...)` + manual SSE | `export async function onRequest(context)` + `createSSEResponse(gen, signal)` |
| `thread_id` from request body | `context.conversation_id` |
| `process.env.X` | `context.env.X` |
| `express.json()` body parsing | `context.request.body` (already parsed) |
