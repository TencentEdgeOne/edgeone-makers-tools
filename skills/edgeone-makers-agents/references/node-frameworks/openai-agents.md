# Route C: OpenAI Agents SDK (`@openai/agents`)

> Use when: multi-agent collaboration (`handoff`), `guardrails`, or scenarios that need `Session` to auto-prepend history.
> Core pattern: `Agent` + `run()` streaming + `context.store.openaiSession()` + event-to-SSE mapping.

---

## Dependencies

```bash
npm install @openai/agents openai zod
```

`edgeone.json`:
```json
{
  "agents": {
    "framework": "openai-agents-sdk",
    "externalNodeModules": ["openai", "@openai/agents"]
  }
}
```

---

## When to use Route C

✅ Good fit:
- Multi-agent collaboration (a Triage Agent routing to specialist Agents via `handoff`)
- Need Session to auto-prepend history (don't want to maintain a messages array by hand)
- Want OpenAI Agents' `guardrails` mechanism for safety rails
- Connect to EdgeOne AI Gateway via the OpenAI-compatible protocol

❌ Not a fit:
- A single agent with simple text generation → Route A (`langchain-route.md`) is lighter
- Need a sandbox to run Python / handle uploaded files → Route B (`claude-sdk-route.md`) is more suitable
- Want fine-grained graph orchestration like LangGraph → Route D (`langgraph-deepagents-route.md`)

---

## Core pattern breakdown

### 1. Model initialization (OpenAI-compatible → AI Gateway)
```typescript
import OpenAI from 'openai';
import { OpenAIChatCompletionsModel } from '@openai/agents';

const DEFAULT_MODEL = '@makers/hy3-preview';

function buildModel(env: Record<string, string | undefined>) {
  const llmClient = new OpenAI({
    apiKey: env.AI_GATEWAY_API_KEY,
    baseURL: env.AI_GATEWAY_BASE_URL,
  });
  return new OpenAIChatCompletionsModel(
    llmClient,
    env.AI_GATEWAY_MODEL ?? DEFAULT_MODEL,
  );
}
```
> ⭐ Note: `new OpenAI({ apiKey, baseURL })` reads from `context.env.X` (NOT `process.env`). `env` is passed in by the caller from `context.env`.

### 2. Agent and tool definitions
```typescript
import { Agent } from '@openai/agents';
import { createTools } from './_tools';   // your own tool set

const agent = new Agent({
  name: 'Assistant',
  instructions: 'You are a helpful assistant. Use the available tools to answer questions.',
  tools: createTools(),
  model,
});
```

`_tools.ts` example:
```typescript
import { tool } from '@openai/agents';
import { z } from 'zod';

export function createTools(contextTools?: any) {
  // Platform tool: grab web_search
  const webSearch = contextTools?.get?.('web_search');

  return [
    tool({
      name: 'search_web',
      description: 'Search the web for information.',
      parameters: z.object({ query: z.string() }),
      async execute({ query }) {
        if (webSearch) {
          const r = await webSearch.execute({ query, maxResults: 5 });
          return typeof r === 'string' ? r : JSON.stringify(r).slice(0, 2000);
        }
        return `[mock] results for: ${query}`;
      },
    }),
  ];
}
```

> You can also use `context.tools.all()` directly (provided `agents.framework: "openai-agents-sdk"` is set in `edgeone.json`); the platform pre-wraps tools so they're OpenAI Agents-compatible.

### 3. Session persistence (key: use the `openaiSession` adapter)
```typescript
import type { Session } from '@openai/agents';

// Inside an agent endpoint: context.store is directly available
const session: Session | undefined =
  context.store && context.conversation_id
    ? context.store.openaiSession(context.conversation_id)
    : undefined;

// Pass it to run(); the framework auto-prepends history
const result = await run(agent, message, { stream: true, signal, session });
```
> ⭐ **Do NOT manually concatenate a messages array.** Pass the Session object returned by `openaiSession()` to `run()`, and the framework automatically pulls history from the store and appends this turn's exchange.

### 4. Stream event → SSE protocol mapping (the most critical conversion)
```typescript
// Convert SDK stream events into this project's SSE events
function toSseEvent(e: any) {
  // Streaming text delta from the model
  if (e.type === 'raw_model_stream_event' && e.data?.type === 'output_text_delta') {
    return { event: 'ai_response', data: { content: e.data.delta as string } };
  }
  // Tool call started
  if (e.type === 'run_item_stream_event' && e.name === 'tool_called') {
    const toolName = e.item?.name ?? e.item?.rawItem?.name;
    if (toolName) return { event: 'tool_call', data: { name: toolName } };
  }
  // Tool returned
  if (e.type === 'run_item_stream_event' && e.name === 'tool_output') {
    const name = e.item?.name ?? e.item?.rawItem?.name;
    const out = e.item?.output ?? e.item?.rawItem?.output;
    return { event: 'tool_result', data: { name, content: typeof out === 'string' ? out.slice(0, 500) : JSON.stringify(out).slice(0, 500) } };
  }
  // Handoff (multi-agent switch)
  if (e.type === 'agent_updated_stream_event') {
    return { event: 'tool_call', data: { name: `handoff:${e.agent?.name}` } };
  }
  return null;   // ignore other events
}
```

### 5. `onRequest` main entry assembly
```typescript
import { run, Agent, OpenAIChatCompletionsModel, type Session } from '@openai/agents';
import OpenAI from 'openai';
import { createLogger, sseEvent, createSSEResponse } from '../_shared';
import { createTools } from './_tools';

const logger = createLogger('chat');
const DEFAULT_MODEL = '@makers/hy3-preview';

export async function onRequest(context: any) {
  const message = (context.request.body ?? {}).message as string | undefined;
  if (!message) {
    return new Response(JSON.stringify({ error: "'message' is required" }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const signal = context.request.signal as AbortSignal | undefined;

  // ⭐ env always comes from context.env; never use process.env
  const env = (context.env ?? {}) as Record<string, string | undefined>;

  // OpenAI-compatible client → AI Gateway
  const llmClient = new OpenAI({
    apiKey: env.AI_GATEWAY_API_KEY,
    baseURL: env.AI_GATEWAY_BASE_URL,
  });
  const model = new OpenAIChatCompletionsModel(
    llmClient,
    env.AI_GATEWAY_MODEL ?? DEFAULT_MODEL,
  );

  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You are a helpful assistant.',
    tools: createTools(context.tools),
    model,
  });

  // Session: use the store adapter directly; do not splice history by hand
  const session: Session | undefined =
    context.store && context.conversation_id
      ? context.store.openaiSession(context.conversation_id)
      : undefined;

  return createSSEResponse(
    async function* () {
      try {
        const result = await run(agent, message, { stream: true, signal, session });
        for await (const event of result.toStream()) {
          if (signal?.aborted) break;
          const sse = toSseEvent(event);
          if (sse) yield sseEvent({ type: sse.event, ...sse.data });
        }
      } catch (e) {
        const err = e as Error;
        if (err.name === 'AbortError' || signal?.aborted) return;
        if (err.message?.includes('terminated') && signal?.aborted) return;
        yield sseEvent({ type: 'error_message', content: err.message });
      }
    },
    signal,
  );
}
```

### 6. `/stop` endpoint (interrupt the current run)
```typescript
// agents/stop/index.ts
export async function onRequest(context: any) {
  // ⚠️ Read the body only; never read the makers-conversation-id header
  // (it would sticky-route to the chat instance currently running)
  const conversationId = context.request?.body?.conversation_id as string | undefined;
  if (!conversationId) {
    return new Response('Missing conversation_id', { status: 400 });
  }
  const ret = context.utils.abortActiveRun(conversationId);
  return new Response(JSON.stringify({
    status: ret?.aborted ? 'aborting' : 'idle',
    conversation_id: conversationId,
    ...ret,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  });
}
```

### 7. `/history` endpoint (cloud-function, no AI calls)
```typescript
// cloud-functions/history/index.ts
import { createLogger } from '../_logger';

const logger = createLogger('history');

export async function onRequestPost(context: any) {
  const body = await readJsonBody(context);
  // ⚠️ Inside a cloud-function, read conversation_id from body; headers are also a plain object
  const conversationId =
    (body.conversation_id || body.conversationId)
    || context?.request?.headers?.['makers-conversation-id']
    || '';

  const store = context.agent?.store;   // ⭐ cloud-function uses context.agent.store
  if (!store || !conversationId) {
    return Response.json({ conversation_id: conversationId, messages: [] });
  }

  // ⭐ Single-object input! Not (id, options)
  const history = await store.getMessages({
    conversationId,
    limit: 100,
    order: 'asc',
  });

  // Filter out SDK-internal messages, group by run_id, take one user+assistant pair per turn
  // ... (see the openai-agents-test template for the full implementation)

  return Response.json({ conversation_id: conversationId, messages: history });
}

async function readJsonBody(context: any) {
  try {
    return await context.request.json();   // cloud-function needs await here, unlike agent runtime
  } catch { return {}; }
}
```
> ⚠️ Inside a cloud-function, `context.request.body` behaves the same as in the agent runtime (already-parsed object), but some older templates/routes also expose an async `context.request.json()` as a fallback. Prefer `context.request.body`.

---

## Route C review checklist

- [ ] `edgeone.json` sets `agents.framework: "openai-agents-sdk"` (required if you inject tools via `context.tools.all()`)
- [ ] Model initialization uses `context.env.AI_GATEWAY_API_KEY` / `AI_GATEWAY_BASE_URL` — **never reads `process.env`**
- [ ] Session uses `context.store.openaiSession(conversation_id)`; **no** hand-spliced messages array
- [ ] Stream-to-SSE mapping: `output_text_delta` → `ai_response`, `tool_called` → `tool_call`, `tool_output` → `tool_result`
- [ ] AbortSignal is passed through to `run()`, and the for-await loop checks `signal?.aborted`
- [ ] Error classification: silence `AbortError` / "terminated"; emit everything else as `error_message`
- [ ] `/stop` uses only the body `{ conversation_id }`; **does not** send the `makers-conversation-id` header
- [ ] `/history` uses `context.agent.store.getMessages({ conversationId, limit })` (**single-object input**)
- [ ] `context.request.headers['x-foo']` uses index access — **not** `.get('x-foo')`
- [ ] ⭐ The frontend includes the `makers-conversation-id` header when calling `/chat`; **omits** it when calling `/stop` (uses the body instead)

See also: `platform-conventions.md`, `sandbox-and-tools.md`, `review-checklist.md`.

---

## Frontend call examples

```typescript
// app/lib/api.ts
const KEY = 'eo_conversation_id';

function getOrCreateConversationId(): string {
  const cached = localStorage.getItem(KEY);
  if (cached) return cached;
  const fresh = crypto.randomUUID();
  localStorage.setItem(KEY, fresh);
  return fresh;
}

// /chat: header is required
export async function callChat(message: string) {
  const conversationId = getOrCreateConversationId();
  return fetch('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'makers-conversation-id': conversationId,        // ⭐ required
    },
    body: JSON.stringify({ message }),
  });
}

// /stop: ⚠️ NEVER send the header
export async function stopAgent() {
  const conversationId = getOrCreateConversationId();
  return fetch('/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },   // no makers-conversation-id
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}

// /history: cloud-function — header or body is fine, either one works
export async function fetchHistory() {
  const conversationId = getOrCreateConversationId();
  const resp = await fetch('/history', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'makers-conversation-id': conversationId,        // recommended, mirrors /chat
    },
    body: JSON.stringify({ conversation_id: conversationId }),
  });
  return resp.json();
}
```

---

## Quick diff vs. Routes A / B / D / E

| Dimension | Route A (LangChain) | Route B (Claude SDK) | **Route C (OpenAI Agents)** |
|-----------|---------------------|----------------------|-----------------------------|
| Agent abstraction | Hand-rolled `bindTools` loop | `query()` built-in loop | `Agent` + `run()` |
| History persistence | Manual `appendMessage` / `getMessages` | `claudeSessionStore()` | **`openaiSession(convId)` auto-prepend** |
| Tool entry point | `bindTools(tools)` | `createSdkMcpServer({ tools })` | `new Agent({ tools })` or `context.tools.all()` |
| Stream events | LangChain `chunk.text` / `tool_call_chunks` | `query` stream `msg.type` dispatch | `result.toStream()`, branch on `e.type` |
| Multi-agent collaboration | Hand-rolled | ❌ (single agent) | ⭐ Handoff |
| Guardrails | Hand-rolled | Use `permissionMode` | ⭐ Built-in `input_guardrails` |

For Routes D and E, see `langgraph-deepagents-route.md` and `crewai-route.md`.
