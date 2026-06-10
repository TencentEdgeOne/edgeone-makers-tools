# Route D: LangGraph / DeepAgents (langchain + deepagents)

> When to use: long-running tasks with automatic context compression, sub-agent orchestration, requires checkpointer/store persistence for short-term + long-term memory.
> Core pattern: `createDeepAgent({ model, systemPrompt, tools, middleware })` + `agent.stream({ messages }, { streamMode })`, with memory wired via `langgraphCheckpointer` / `langgraphStore`.

---

## When to Pick Route D

✅ Good fit:
- Long agent tasks (writing, research) — DeepAgents' automatic context compression saves manual work
- Need LangGraph short-term thread state (`langgraphCheckpointer`) + long-term KV (`langgraphStore`)
- Want middleware (`modelRetryMiddleware` / `toolCallLimitMiddleware` / `toolRetryMiddleware`, etc.)
- Multi-step research workflows (search → deep-read → cite → produce)

❌ Not a good fit:
- Single-turn short Q&A → Route A is lighter (see `langchain-route.md`)
- Need a sandbox to run code → Route B (see `claude-sdk-route.md`)
- Multi-agent handoff collaboration → Route C's OpenAI Agents is more intuitive (see `openai-agents-route.md`)

---

## Core Pattern Breakdown

### 1. Model initialization (can share `_model.ts` with Route A)
```typescript
import { initChatModel } from 'langchain';

interface AgentEnv {
  AI_GATEWAY_API_KEY: string;
  AI_GATEWAY_BASE_URL: string;
}

function getEnv(contextEnv: Record<string, string | undefined> | undefined): AgentEnv {
  const source = contextEnv ?? {};
  const required = ['AI_GATEWAY_API_KEY', 'AI_GATEWAY_BASE_URL'] as const;
  const missing = required.filter((k) => !source[k]?.trim());
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  return {
    AI_GATEWAY_API_KEY: source.AI_GATEWAY_API_KEY!,
    AI_GATEWAY_BASE_URL: source.AI_GATEWAY_BASE_URL!,
  };
}

let _model: any = null;
async function getModel(env: AgentEnv) {
  if (_model) return _model;
  _model = await initChatModel('@makers/deepseek-v4-flash', {
    modelProvider: 'openai',
    apiKey: env.AI_GATEWAY_API_KEY,
    configuration: { baseURL: env.AI_GATEWAY_BASE_URL },
    temperature: 0,
    timeout: 300_000,
  });
  return _model;
}
```
> ⭐ env always comes from `context.env` — never use `process.env`.

### 2. Tool definition (using the langchain `tool` helper)
```typescript
import { tool } from 'langchain';
import { z } from 'zod';

const internetSearch = tool(
  async ({ query, maxResults = 3 }: { query: string; maxResults?: number }) => {
    // Prefer the platform's web_search tool
    // const ws = contextTools?.get?.('web_search');
    // if (ws) return await ws.execute({ query, maxResults });
    return `[mock] results for: ${query}`;
  },
  {
    name: 'internet_search',
    description: 'Search the internet for information.',
    schema: z.object({
      query: z.string().describe('Search query'),
      maxResults: z.number().optional().default(3),
    }),
  }
);
```
> You can also use `context.tools.all()` directly (provided `agents.framework: "deepagents"` or `"langgraph"` is set in `edgeone.json`) — the platform already wraps them as LangChain-compatible tools.

### 3. Agent assembly (DeepAgents + Middleware)
```typescript
import { createDeepAgent } from 'deepagents';
import {
  modelRetryMiddleware,
  modelCallLimitMiddleware,
  toolRetryMiddleware,
  toolCallLimitMiddleware,
} from 'langchain';

let _agent: any = null;
function getAgent(model: any, contextStore: any) {
  if (_agent) return _agent;

  // ⭐ Memory: pull the langgraph adapters from context.store
  const checkpointer = contextStore?.langgraphCheckpointer;   // short-term thread state (direct property)
  const lgStore = contextStore?.langgraphStore;               // long-term KV (direct property)

  _agent = createDeepAgent({
    model,
    systemPrompt: SYSTEM_PROMPT,
    tools: [internetSearch],
    // Middleware layer: rate limiting + retry + tool call cap
    middleware: [
      modelRetryMiddleware({ maxRetries: 3 }),
      modelCallLimitMiddleware({ runLimit: 30 }),                                // ⭐ global call cap
      toolRetryMiddleware({ maxRetries: 2, tools: ['internet_search'] }),
      toolCallLimitMiddleware({ toolName: 'internet_search', runLimit: 15 }),    // ⭐ per-tool cap
    ],
    // ⭐ Memory (if your deepagents version supports passing checkpointer/store)
    // checkpointer,
    // store: lgStore,
  });
  return _agent;
}
```

> ⚠️ Note: the current `deepagents-test-starter` template does **not** explicitly pass `checkpointer` / `store`, because the deepagents version may use a default in-memory implementation. If you need persistent thread state:
> - Use LangGraph directly: call `compile({ checkpointer, store: lgStore })` yourself
> - DeepAgents: check the latest version's API to see whether checkpointer/store can be injected

### 4. Streaming SSE conversion (core: dispatch by chunk type)
```typescript
import { AIMessageChunk, ToolMessage } from 'langchain';
import { sseEvent } from '../_shared';

async function* eventStream(
  agent: any,
  userMessage: string,
  conversationId: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  try {
    const stream = await agent.stream(
      { messages: [{ role: 'user', content: userMessage }] },
      {
        streamMode: 'messages',                               // ⭐ token-level stream (vs. 'updates' for node-level)
        signal,
        configurable: { thread_id: conversationId },          // ⭐ thread_id = conversation_id
      }
    );

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const [message] = chunk;

      // 1. AI tool_call fragments (streaming tool calls)
      if (AIMessageChunk.isInstance(message) && message.tool_call_chunks?.length) {
        for (const tc of message.tool_call_chunks) {
          if (tc.name) yield sseEvent({ type: 'tool_call', name: tc.name });
        }
        continue;
      }

      // 2. ToolMessage (tool return value)
      if (ToolMessage.isInstance(message)) {
        yield sseEvent({
          type: 'tool_result',
          name: message.name,
          content: message.text?.slice(0, 500) ?? '',
        });
        continue;
      }

      // 3. AI text delta
      if (AIMessageChunk.isInstance(message) && message.text) {
        const cleaned = message.text.replace(/\n{3,}/g, '\n\n');
        if (cleaned) yield sseEvent({ type: 'ai_response', content: cleaned });
      }
    }
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError' || signal?.aborted) return;
    if (err.message?.includes('terminated') && signal?.aborted) return;
    yield sseEvent({ type: 'error_message', content: err.message });
  }
  yield 'data: [DONE]\n\n';
}
```

### 5. onRequest entry point
```typescript
import { createLogger, createSSEResponse } from '../_shared';

const logger = createLogger('chat');
const SYSTEM_PROMPT = 'You are a helpful research assistant.';

export async function onRequest(context: any) {
  const { request, env, conversation_id: conversationId, run_id: runId, store } = context;
  const { message } = request?.body ?? {};
  if (!message) {
    return new Response('Missing chat message', { status: 400 });
  }

  const signal = request?.signal as AbortSignal | undefined;

  let agent;
  try {
    const envVars = getEnv(env);                  // ⭐ context.env
    const model = await getModel(envVars);
    agent = getAgent(model, store);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return createSSEResponse(
    (sig) => eventStream(agent, message, conversationId, sig),
    signal,
  );
}
```

---

## ⚠️ Critical: Where langgraphCheckpointer / langgraphStore Live

**`langgraphCheckpointer` and `langgraphStore` are ONLY available on `context.store` (i.e., agent endpoints).** The runtime strips them from cloud-function `context.agent.store`, so they are **NOT** present there.

This matters specifically for Route D, since LangGraph is the whole point of this route:
- ✅ `context.store.langgraphCheckpointer` — works inside agent endpoints (e.g., `/chat`)
- ✅ `context.store.langgraphStore` — works inside agent endpoints
- ❌ `context.agent.store.langgraphCheckpointer` — does **not** exist (undefined)
- ❌ `context.agent.store.langgraphStore` — does **not** exist (undefined)

If you need to compile a LangGraph from a cloud function, that's not the supported pattern — keep all LangGraph compilation inside agent endpoints.

Also note both are **direct properties**, not methods. Access them via `context.store.langgraphCheckpointer` (no parentheses), not `context.store.langgraphCheckpointer()`.

---

## ⚠️ Critical: `langgraphStore.search` Is NOT Vector Retrieval

`langgraphStore.search` does **NOT** perform semantic / vector retrieval. The `score` field on every result is always `undefined`. It's a key-prefix scan, not embedding similarity.

If you need genuine semantic search, build your own embedding pipeline (or use a dedicated vector index) and store/look-up vectors yourself. Do not rely on `langgraphStore.search` for relevance ranking.

---

## Sub-Agent Orchestration (DeepAgents Feature)

DeepAgents lets you delegate to sub-agents. Each sub-agent can have its own toolset and systemPrompt:

```typescript
import { createDeepAgent } from 'deepagents';

const researchAgent = createDeepAgent({
  model,
  systemPrompt: 'You are a research expert. Use internet_search aggressively.',
  tools: [internetSearch, fetchWebpage],
  middleware: [/* ... */],
});

const writerAgent = createDeepAgent({
  model,
  systemPrompt: 'You are a writer. Compose articles from research notes.',
  tools: [/* writing tools */],
  // Allow the writer to invoke the researcher as a sub-agent
  subAgents: [
    {
      name: 'research_specialist',
      description: 'Use this for in-depth research tasks',
      agent: researchAgent,
    },
  ],
});
```

> Sub-agent state is automatically isolated — the parent agent only sees the sub-agent's final result, and intermediate steps don't pollute its context. This is one of DeepAgents' core values.

---

## Using LangGraph Directly (skip the DeepAgents high-level wrapper)

When you want fine-grained graph control:

```typescript
import { StateGraph, MessagesAnnotation, START, END, Annotation, Command, Send } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';

const modelWithTools = model.bindTools([internetSearch]);
const toolNode = new ToolNode([internetSearch]);

async function agentNode(state: typeof MessagesAnnotation.State) {
  return { messages: [await modelWithTools.invoke(state.messages)] };
}
function shouldContinue(state: typeof MessagesAnnotation.State): 'tools' | '__end__' {
  const last = state.messages[state.messages.length - 1] as any;
  return (last.tool_calls?.length) ? 'tools' : '__end__';
}

// ⭐ Key point: pull the langgraph adapters from context.store
const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldContinue)
  .addEdge('tools', 'agent')
  .compile({
    checkpointer: context.store.langgraphCheckpointer,    // direct property
    store: context.store.langgraphStore,                  // direct property
  });

// Pass thread_id when invoking
const result = await graph.invoke(
  { messages: [{ role: 'user', content: message }] },
  { configurable: { thread_id: context.conversation_id }, signal },
);
```

`streamMode` choices:
- `'messages'`: token-level stream (most common, ideal for SSE)
- `'updates'`: node-level stream (one emission per node completion)
- `'values'`: full state at every step (useful for debugging)

LangGraph also supports `interrupt` / `resume` for human-in-the-loop flows and `subgraph` for nested graphs — see the LangGraph docs for details.

---

## /history (cloud-function)

```typescript
// cloud-functions/history/index.ts
export async function onRequestPost(context: any) {
  const body = (await context.request.json()) ?? {};
  const conversationId =
    body.conversation_id || body.conversationId
    || context.request?.headers?.['makers-conversation-id']
    || '';

  const store = context.agent?.store;   // ⭐ cloud-functions use context.agent.store
  if (!store || !conversationId) {
    return Response.json({ conversation_id: conversationId, messages: [] });
  }

  // ⭐ single-object argument
  const history = await store.getMessages({
    conversationId,
    limit: 100,
    order: 'asc',
  });

  return Response.json({ conversation_id: conversationId, messages: history });
}
```

> ⚠️ Reminder: the LangGraph thread state (inside the checkpointer) is LangGraph's private data structure — it is **not** the conversation history that `getMessages` returns. If you want to display conversation history to the user, you need to **separately** call `appendMessage` on `context.store` / `context.agent.store` after each model turn to persist the message. See `memory-store.md` for details.

---

## Route D Review Highlights

- [ ] `edgeone.json` has `agents.framework: "deepagents"` or `"langgraph"` (required if you inject tools via `context.tools.all()`)
- [ ] Model / agent instances are cached as module-level singletons (avoid rebuilding on each request)
- [ ] env always comes from `context.env` — **never read `process.env`**
- [ ] Middleware includes a call cap (`modelCallLimitMiddleware` or `toolCallLimitMiddleware`)
- [ ] Middleware includes retries (`modelRetryMiddleware` / `toolRetryMiddleware`)
- [ ] Streaming uses `streamMode: 'messages'` (token-level), with `AIMessageChunk` / `ToolMessage` dispatched as SSE events
- [ ] `signal` is forwarded into `agent.stream()` / `graph.invoke()` and checked inside the for-await loop
- [ ] Error classification: AbortError / "terminated" silenced; everything else surfaced as `error_message`
- [ ] Stream ends with `data: [DONE]\n\n`
- [ ] Heartbeat + four anti-buffering response headers all set (use `createSSEResponse` from `_shared.ts`)
- [ ] If using native LangGraph `compile({ checkpointer, store })`, both values come from `context.store.langgraphCheckpointer` / `context.store.langgraphStore` (**direct properties, not methods**)
- [ ] `graph.invoke(..., { configurable: { thread_id: conversation_id } })` uses the conversation ID as the thread
- [ ] /stop only takes the body `{ conversation_id }` — **no** `makers-conversation-id` header
- [ ] /history calls `context.agent.store.getMessages({ conversationId, limit })` (**single-object argument**)
- [ ] ⭐ Frontend sends the `makers-conversation-id` header on `/chat` calls; **omits** it on `/stop` calls (uses body instead)

See `review-checklist.md` for the full cross-route checklist, `platform-conventions.md` for shared conventions, and `sandbox-and-tools.md` for tool wiring.

---

## Frontend Call Example

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

// /chat (or /research / /tool / any AI endpoint): header is required
export async function callChat(message: string) {
  const conversationId = getOrCreateConversationId();
  return fetch('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'makers-conversation-id': conversationId,        // ⭐ required; lets the langgraph thread_id follow along
    },
    body: JSON.stringify({ message }),
  });
}

// /stop: ⚠️ never include the header
export async function stopAgent() {
  const conversationId = getOrCreateConversationId();
  return fetch('/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },   // no makers-conversation-id
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}
```

---

## Quick Comparison vs. Routes A / B / C / E

| Dimension                 | Route A (LangChain direct) | Route B (Claude SDK)     | Route C (OpenAI Agents)  | **Route D (DeepAgents/LangGraph)**                                  | Route E (CrewAI)         |
| ------------------------- | -------------------------- | ------------------------ | ------------------------ | ------------------------------------------------------------------- | ------------------------ |
| Agent abstraction         | Hand-written bindTools loop| `query()`                | `Agent` + `run()`        | `createDeepAgent` or LangGraph graph                                | `Crew` + `Task`          |
| History persistence       | `appendMessage`/`getMessages` | `claudeSessionStore()`| `openaiSession(convId)`  | **`langgraphCheckpointer` (short-term) + `langgraphStore` (long-term)** | `appendMessage`/`getMessages` |
| Tool entry point          | `bindTools(tools)`         | `createSdkMcpServer`     | `new Agent({ tools })`   | `createDeepAgent({ tools })`                                        | `Tool` instances         |
| Sub-agents                | ❌                         | ❌                       | Handoff                  | ⭐ subAgents with isolated context                                  | Crew of agents           |
| Auto context compression  | ❌                         | ❌                       | ❌                       | ⭐ DeepAgents built-in                                              | ❌                        |
| Middleware                | DIY                        | permissionMode           | guardrails               | ⭐ retry / callLimit / toolLimit                                    | DIY                       |
| Stream mode               | LangChain stream           | query stream             | toStream()               | ⭐ `streamMode: messages/updates/values`                            | DIY                       |
| Native LangGraph          | Not needed                 | Not needed               | Not needed               | ✅ (for fine-grained graph orchestration)                           | Not needed                |

See `crewai-route.md` for Route E details.
