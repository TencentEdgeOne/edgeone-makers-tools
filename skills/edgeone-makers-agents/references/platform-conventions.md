# EdgeOne Makers Agent — Full Platform Conventions

> This document spells out every convention in detail. Use it alongside SKILL.md. Each section gives you the principle plus a real example.

---

## 1. File Routing Convention

### Principle
- `agents/<name>.ts` or `agents/<name>/index.ts` → automatically mapped to `POST /<name>`
- Files with an `_` prefix are not mapped to routes; they are internal modules only (e.g. `_shared.ts` / `_tools.ts` / `_skills.ts`)
- ⭐ **The CLI scans and generates `.edgeone/agent-node/config.json` automatically at build time.** Templates **do not** need to hand-write it.
- For method-specific handlers, export `onRequestPost` / `onRequestGet` / `onRequestPut` / `onRequestPatch` / `onRequestDelete` / `onRequestHead` / `onRequestOptions`. Dispatch order: method-specific first, then fall back to `onRequest`.

### Example
```
agents/create-lite.ts        → POST /create-lite
agents/create.ts             → POST /create
agents/outline.ts            → POST /outline
agents/stop.ts               → POST /stop
agents/chat/index.ts         → POST /chat
agents/_shared.ts            → internal module (not a route)
agents/_model.ts             → internal module (not a route)
```

### `.edgeone/agent-node/config.json` (auto-generated artifact — do not hand-edit)
This file appears after a build; routes are derived by the CLI scanning the `agents/` directory. **Do not** put it in any "must-maintain" checklist that you check into version control — it is a build artifact.

> ⚠️ **How to spot a violation during review**: check the project root `.gitignore`:
> - Contains `.edgeone` → a local `.edgeone/agent-node/config.json` is just a build artifact, **not a violation**
> - Does not contain `.edgeone` → the entire `.edgeone/` directory has been committed into the repo, **that is the violation** (either add it to `.gitignore`, or run `git rm -r --cached .edgeone` to clean up the commit)
>
> Older skill versions required hand-maintaining this file — that is deprecated. To add a new endpoint, just drop the corresponding file into `agents/`.

---

## 2. `onRequest` Entry Convention

### Principle
- The default exported function is named `onRequest`, signature `(context: any) => Promise<Response>`
- Method-specific variants are also supported: `onRequestPost` / `onRequestGet` / `onRequestPut` / `onRequestPatch` / `onRequestDelete` / `onRequestHead` / `onRequestOptions` (works for both agent and cloud-function endpoints)
- Dispatch order: method-specific match first, fall back to `onRequest`
- Destructure platform-injected resources from `context`. **Do not** import the model SDK yourself, and **do not** read `process.env` (use `context.env`)
- The request body has already been parsed into an object by the platform; just use `context.request.body` directly
- ⚠️ Request headers are a plain object, not the Headers API: use `context.request.headers['x-foo']`, **not** `.get('x-foo')`

### Fields injected on `context`
| Field | Type | Description |
|-------|------|-------------|
| `context.request.body` | object | The parsed request body |
| `context.request.signal` | AbortSignal | Client-disconnect signal — you must listen for this |
| `context.request.headers` | `Record<string, string>` | ⚠️ Plain object — **use `headers['x']`**, not `.get('x')` |
| `context.request.method` | string | HTTP method |
| `context.request.url` | string | Full URL |
| `context.request.query` | object | Parsed query params (aligned with Node Functions) |
| `context.env` | `Record<string,string>` | ⭐ Injected environment variables (`AI_GATEWAY_*` etc.). **`process.env` is forbidden inside `agents/` and `cloud-functions/`** — always use `context.env` |
| `context.tools` | `ToolsContext` | Platform tool set (lazy-loaded; shape is determined by `agents.framework`) |
| `context.sandbox` | `SandboxClient \| null` | Sandbox (lazy-loaded; `commands.run` / `files.write` / `runCode` / `browser`) |
| `context.store` | `AgentMemory` | Conversation store (messages + metadata + adapters for the five frameworks) |
| `context.conversation_id` | string | Automatically injected from the HTTP header `makers-conversation-id` |
| `context.run_id` | string | The current run ID (note: it is `run_id`, not `runId` in camelCase) |
| `context.utils.abortActiveRun(conversationId)` | function | **Injected by the agent runtime only** — cloud-function does not have it |
| `context.agent` | object | **Injected only in cloud-function**, contains `{ conversation_id, store }`. ⚠️ The shape of `store` is **not the same as** `context.store` — the runtime strips out `langgraphCheckpointer` and `langgraphStore` inside `createCloudFunctionAgentStore`, leaving only the generic message API plus `openaiSession` / `claudeSessionStore`. See [memory-store.md §1](memory-store.md) |

### Skeleton
```typescript
export async function onRequest(context: any) {
  const { request, env, tools: contextTools, sandbox, store } = context;
  const body = request?.body ?? {};
  const signal = request?.signal as AbortSignal | undefined;
  const conversationId = context.conversation_id
    || request?.headers?.['makers-conversation-id']
    || '';

  // 1. Validate input
  if (!body.message) {
    return new Response(JSON.stringify({ error: "'message' is required" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Prepare the model (differs between Route A/B; always read env via context.env, never process.env)
  // 3. Return the SSE stream
}
```

### ⚠️ The Iron Rule on Environment Variables
- Every `.ts` file under `agents/`: **`process.env.X` is forbidden**, **`context.env.X` is mandatory**
- Every `.ts` file under `cloud-functions/`: **`process.env.X` is forbidden**, **`context.env.X` is mandatory**
- ⚠️ **Both reads and writes are forbidden**: mutations like `process.env.X = 'foo'` are equally illegal — `process.env` is shared across the same process, multiple handler instances may run concurrently inside the agent runtime, and a mutation will pollute other handlers' env. If some SDK requires "configure via environment variable" (e.g. `OPENAI_AGENTS_DISABLE_TRACING`), prefer the SDK's own options/parameter API. If the SDK truly only supports the env path, accept the pollution but add a comment explaining it, and concentrate it inside a single init file.
- Frontend `app/` directory: not subject to this restriction (Next.js `process.env` / `NEXT_PUBLIC_*` work as usual)
- Shared internal modules (`_shared.ts` / `_model.ts`, etc.): take `env` as a parameter, with the caller passing in `context.env`. The module itself must not read global env.

---

## 3. Environment Variables and Model Convention

### Principle
- Unified gateway variables: `AI_GATEWAY_API_KEY`, `AI_GATEWAY_BASE_URL`, plus optional `AI_GATEWAY_MODEL` / `AI_GATEWAY_SMALL_MODEL`
- Missing variables must throw explicitly — never silently degrade
- Default model as a constant: `@makers/deepseek-v4-flash`
- ⭐ **If the template uses `context.tools.web_search`**: you must also configure `WSA_API_KEY` in the project's environment variables. Create an API KEY in the [Tencent Cloud Web Search API console](https://console.cloud.tencent.com/wsapi/index), copy the value, and set `WSA_API_KEY=<value>` in the EdgeOne project environment variables (reference docs: https://cloud.tencent.com/document/product/1806/130615). This variable is read directly by the sandbox runner; template code typically does not need to reference it explicitly. Without it, search will fail authentication / return 401. Detailed steps in `sandbox-and-tools.md`.

### Route A — env validation + model initialization (`agents/_model.ts` / `_shared.ts`)
```typescript
import { initChatModel } from 'langchain';

const MODEL_NAME = '@makers/deepseek-v4-flash';

export interface AgentEnv {
  AI_GATEWAY_API_KEY: string;
  AI_GATEWAY_BASE_URL: string;
}

export function getAgentEnv(contextEnv: Record<string, string | undefined> | undefined): AgentEnv {
  const source = contextEnv ?? {};
  const required = ['AI_GATEWAY_API_KEY', 'AI_GATEWAY_BASE_URL'] as const;
  const missing = required.filter((k) => !source[k]?.trim());
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  return {
    AI_GATEWAY_API_KEY: source.AI_GATEWAY_API_KEY!,
    AI_GATEWAY_BASE_URL: source.AI_GATEWAY_BASE_URL!,
  };
}

// Cache the model instance per baseURL to avoid repeated initialization
const modelCache = new Map<string, any>();

export async function createModel(env: AgentEnv, options?: { timeout?: number }) {
  const cacheKey = `${MODEL_NAME}:${env.AI_GATEWAY_BASE_URL}`;
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey)!;

  const model = await initChatModel(MODEL_NAME, {
    modelProvider: 'openai',
    apiKey: env.AI_GATEWAY_API_KEY,
    configuration: { baseURL: env.AI_GATEWAY_BASE_URL },
    timeout: options?.timeout ?? 300_000,
  });
  modelCache.set(cacheKey, model);
  return model;
}
```

### Route B — Gateway env mapping (`agents/_model.ts`)
```typescript
const DEFAULT_MODEL = '@makers/deepseek-v4-flash';

export function resolveModelName(env: Record<string, string | undefined>): string {
  return env.AI_GATEWAY_MODEL || DEFAULT_MODEL;
}

// Map EdgeOne Gateway variables to the ANTHROPIC_* names the Claude Agent SDK expects.
// Returns a Record to inject into query()'s options.env — never reads process.env.
export function collectGatewayEnv(env: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  if (env.AI_GATEWAY_BASE_URL) result.ANTHROPIC_BASE_URL = env.AI_GATEWAY_BASE_URL;
  if (env.AI_GATEWAY_API_KEY) result.ANTHROPIC_API_KEY = env.AI_GATEWAY_API_KEY;
  if (env.AI_GATEWAY_SMALL_MODEL || env.AI_GATEWAY_MODEL) {
    result.ANTHROPIC_SMALL_FAST_MODEL = env.AI_GATEWAY_SMALL_MODEL || env.AI_GATEWAY_MODEL || '';
  }
  if (env.ANTHROPIC_CUSTOM_HEADERS) result.ANTHROPIC_CUSTOM_HEADERS = env.ANTHROPIC_CUSTOM_HEADERS;
  return result;
}

// Caller side (agents/chat/index.ts):
// const gatewayEnv = collectGatewayEnv(context.env);   // ⭐ context.env, never process.env
// query({ ..., options: { env: gatewayEnv, ... } })
```

---

## 4. SSE Streaming Protocol Convention (the most important unification)

### Principle
- Every agent endpoint returns `text/event-stream`, with each event formatted as `data: <JSON>\n\n`
- The `type` field has a fixed enumeration (see table below); the frontend dispatches by type
- 5-second `ping` heartbeat; the stream ends with `data: [DONE]\n\n`
- Four required response headers: `Content-Type` + `Cache-Control:no-cache` + `Connection:keep-alive` + `X-Accel-Buffering:no`

### Unified Event Type Table
| type | Fields | Meaning |
|------|--------|---------|
| `ai_response` | `content` | Streaming text delta from the model |
| `tool_call` | `name` | A tool invocation has started |
| `tool_result` | `name`, `content` | Tool result (truncated to ~500 characters) |
| `suggest_actions` | `actions[]` | Suggested actions (clickable options) |
| `file_output` | `base64`, `filename`, `description` | Downloadable file output |
| `usage` | `input_tokens`, `output_tokens`, `total_tokens` | Token statistics |
| `ping` | `ts` | Heartbeat keep-alive |
| `error_message` | `content` | Error message (must not crash the stream) |
| — | — | Send `data: [DONE]\n\n` at the end |

### Reusable SSE Helper (place in `agents/_shared.ts` — multimodal version recommended)
```typescript
export function createLogger(name: string) {
  return {
    log(...args: unknown[]) { console.log(`[${name}][${new Date().toISOString()}]`, ...args); },
    error(...args: unknown[]) { console.error(`[${name}][${new Date().toISOString()}]`, ...args); },
  };
}

export function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function createSSEResponse(
  generator: (signal?: AbortSignal) => AsyncGenerator<string>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(sseEvent({ type: 'ping', ts: Date.now() }))); }
        catch { /* stream closed */ }
      }, 5_000);
      try {
        for await (const chunk of generator(signal)) {
          if (signal?.aborted) break;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        const error = e as Error;
        if (error.message?.includes('terminated') && signal?.aborted) {
          // graceful — aborted with content already sent
        } else if (error.name !== 'AbortError' && !signal?.aborted) {
          controller.enqueue(encoder.encode(sseEvent({ type: 'error_message', content: error.message })));
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
    cancel() { /* client disconnected */ },
  });
  return new Response(readableStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

> **Recommendation**: consolidate this helper set into `_shared.ts` and have every endpoint call `createSSEResponse(gen, signal)`.
> Don't rewrite a `ReadableStream` in every file (the older content-creator code did this inline; align toward the multimodal version).

---

## 5. cloud-functions Convention (Data Persistence)

### Principle
- Separate from `agents/`: `agents/` handles AI, `cloud-functions/` handles data CRUD
- One directory per resource: `cloud-functions/<resource>/index.ts`
- Returns JSON (no streaming); used for KV / Blob / preferences / health checks

### Example layout
```
cloud-functions/
├── _logger.ts
├── health/index.ts          → GET /health
├── articles/index.ts        → article CRUD
└── preferences/index.ts     → user preference read/write
```

### Storage dependencies
- KV/Blob: `@edgeone/pages-blob` (see content-creator's package.json)
- Access conversation-scoped storage via `context.store`

---

## 6. Frontend Convention (`app/`)

### Principle
- Standard Next.js App Router: `app/layout.tsx` + `app/page.tsx`
- Components live in `app/components/`; frontend utilities in `app/lib/` (e.g. `conversation-context.tsx`)
- Global utilities (i18n, cn utils) in the root-level `lib/`
- Frontend calls agent endpoints via `fetch('/<action>', { method:'POST', body })`, then reads SSE with `EventSource` / `ReadableStream`

### ⭐ Conversation ID and the `makers-conversation-id` Header (Iron Rule)

**Every fetch to an AI endpoint must carry the `makers-conversation-id` HTTP header** — that means `/chat`, `/outline`, `/create`, `/create-lite`, every endpoint under `agents/`. Otherwise:
- The backend's `context.conversation_id` will be empty
- The session adapters (`openaiSession` / `claudeSessionStore`) cannot resume history
- Sticky routing breaks — each request may land on a different agent instance
- `/stop` cannot find the running run, and abort silently fails

**Generate + persist pattern (recommended on the frontend)**:
```typescript
// app/lib/conversation-id.ts
const KEY = 'eo_conversation_id';

export function getOrCreateConversationId(): string {
  if (typeof window === 'undefined') return '';
  const cached = localStorage.getItem(KEY);
  if (cached) return cached;
  const fresh = crypto.randomUUID();
  localStorage.setItem(KEY, fresh);
  return fresh;
}

export function rotateConversationId(): string {
  const fresh = crypto.randomUUID();
  if (typeof window !== 'undefined') localStorage.setItem(KEY, fresh);
  return fresh;
}
```

**Calling AI endpoints (header is mandatory)**:
```typescript
// app/page.tsx or app/lib/api.ts
const conversationId = getOrCreateConversationId();

const resp = await fetch('/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'makers-conversation-id': conversationId,   // ⭐ required
  },
  body: JSON.stringify({ message, files }),
});
```

**Calling `/stop` (⚠️ inverted: never carry the header)**:
```typescript
// Note: fetch /stop must NOT carry makers-conversation-id.
// Otherwise sticky routing pins to the same stuck chat instance and abortActiveRun cannot reach the runner.
const resp = await fetch('/stop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },   // no makers-conversation-id
  body: JSON.stringify({ conversation_id: conversationId }),  // pass via body
});
```

**Calling `/history` (cloud-function — header is optional)**:
```typescript
// /history is a cloud-function: there's no sticky-routing concern; either header or body works.
const resp = await fetch('/history', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'makers-conversation-id': conversationId,    // recommended (consistent with chat)
  },
  body: JSON.stringify({ conversation_id: conversationId }),
});
```

### Endpoint → Frontend Call Style Cheat Sheet

| Endpoint | Type | Header `makers-conversation-id` | Body `conversation_id` |
|----------|------|--------------------------------|------------------------|
| `/chat` | agent | ✅ **required** | usually not needed |
| `/outline` / `/create` and other AI endpoints | agent | ✅ **required** | usually not needed |
| `/stop` | agent | ❌ **never** | ✅ **required** (only channel) |
| `/history` | cloud-function | recommended | recommended (either works) |
| `/preferences` and other pure data CRUD | cloud-function | recommended | as needed |
| `/health` and other endpoints with no conversation | cloud-function | not needed | not needed |

### i18n
- Use `lib/i18n.tsx` to provide a Provider + hook
- Language hint: the frontend appends a locale tag (e.g. a Chinese-language tag, or `[Language: English]`) to the end of the message; the backend determines locale from this

---

## 7. package.json Dependency Baseline

### Route A (content-creator)
```jsonc
{
  "type": "module",
  "dependencies": {
    "@langchain/core": "^1.1.40",
    "@langchain/openai": "^1.4.4",
    "langchain": "^1.3.3",
    "deepagents": "^1.9.0",
    "zod": "^4.3.6",
    "next": "^16.0.0",
    "react": "^19.2.5",
    "@edgeone/pages-blob": "^0.0.4"
  }
}
```

### Route B (multimodal)
```jsonc
{
  "type": "module",
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.3.144",
    "zod": "^4.0.0",
    "next": "^16.0.0",
    "react": "^19.2.5"
  }
}
```

> Unified baseline: `"type": "module"`, Next 16, React 19, Tailwind 3, TS 5.6+.

---

## 8. Memory / Persistence Convention (based on the official `context.store` API)

> ⚠️ **This section is the authoritative revised version (re-verified against source)**: the source of truth is the actual implementation in `tef-cli/src/agent/memory.ts`.
> The earlier circulating advice — "simulate KV with `clearMessages` + `appendMessage`, or wrap your own `kvGet/kvSet`" — was a **wrong workaround** and is now deprecated.
> `context.store` is itself the **conversation-storage abstraction provided by the platform**, and it ships **official adapters** for each Agent framework. Use them directly — don't fight the API.

### 8.0 First Principle: `store` is "conversation storage", not a low-level KV

`context.store` **does not** expose a raw KV interface like `get/set/delete/list`. It is a conversation-oriented storage abstraction with four capability blocks:

| Capability Block | Key Methods | Use |
|------------------|-------------|-----|
| Conversation messages | `appendMessage(input)` / `getMessages(input)` / `updateMessage(input)` / `deleteMessage(input)` / `clearMessages(input)` | Read/write conversation history; supports `userId` indexing and stable cursor pagination |
| Conversation metadata | `getConversation(id)` / `updateConversation(id, { metadata })` (metadata is shallow-merged) / `listConversations()` / `deleteConversation(id)` | Conversation title, tags, user profile, etc. |
| Framework-native session adapters | `openaiSession(id)` / `claudeSessionStore()` | Direct integration for OpenAI Agents / Claude SDK |
| LangGraph / DeepAgents adapters | `langgraphCheckpointer` (short-term thread state, **direct property**), `langgraphStore` (long-term KV store, **direct property**) | Standard memory backends for LangGraph / DeepAgents |

Plus two format-conversion helpers: `toOpenAIInput(messages)` / `toAnthropicMessages(messages)` — convert stored memory directly into model input.

### 8.1 Two entry points: determined by endpoint type (the most critical distinction)

**The storage entry point is decided by "which directory this endpoint lives in"**:

| Endpoint Type | Located in | Storage Entry | Adapter Availability |
|---------------|------------|---------------|----------------------|
| **Calls AI** (agent inference endpoint) | `agents/<name>/` | `context.store` | ✅ All adapters |
| **Plain endpoint** (no AI, pure data CRUD) | `cloud-functions/<resource>/` | `context.agent.store` | ⚠️ **Excludes** `langgraphCheckpointer` / `langgraphStore`; other adapters included |

> ⭐ **Critical difference**: although `context.store` and `context.agent.store` are both built on the underlying `createAgentMemory` factory, the cloud-function runtime **explicitly strips out** the `langgraphCheckpointer` and `langgraphStore` properties during destructuring inside `createCloudFunctionAgentStore` (source: `tef-cli/src/pages/builder/impls/node-function.ts:1944-1952`).
>
> **Conclusion**:
> - Inside `cloud-functions/`, what you can use: the generic message API (`appendMessage` / `getMessages` / `getConversation`, etc.) plus `openaiSession` and `claudeSessionStore`
> - Inside `cloud-functions/`, what you **cannot** use: `store.langgraphStore.get/put/delete`, `store.langgraphCheckpointer`
> - Endpoints that need langgraph KV operations must live under `agents/<name>/` and use `context.store`
>
> **Historical context**: early skill versions claimed "the two shapes are identical" — that was based on an outdated branch or a test stub that never went live. This section reflects the actual tef-cli source.

### 8.2 Five Frameworks → Adapter Mapping (use the official adapters; don't roll your own)

| Framework | Short-term memory (intra-conversation) | Long-term memory (cross-conversation) | EdgeOne Integration |
|-----------|---------------------------------------|--------------------------------------|---------------------|
| **Claude Agent SDK** ⭐ standalone usage | SDK session (resume/fork) | Store messages/metadata yourself | `const sessionStore = context.store.claudeSessionStore()` (**no args**), pass it to the SDK's session mechanism. **Usage differs completely from the three frameworks below — do not try to bolt langgraph onto it** |
| **OpenAI Agents SDK** | SDK Session (auto-prepends history) | Store yourself | `const session = context.store.openaiSession(conversationId)`, pass to `Runner` / `run()`'s session option |
| **LangGraph** | `langgraphCheckpointer` (short-term thread state) | `langgraphStore` (namespace + KV) | `const checkpointer = context.store.langgraphCheckpointer`; `const lgStore = context.store.langgraphStore` |
| **DeepAgents** | Reuses LangGraph's checkpointer | LangGraph store + filesystem backend | Same as LangGraph: `context.store.langgraphCheckpointer` + `context.store.langgraphStore` |
| **Bare model calls / custom loop** (Route A) | Use `appendMessage`/`getMessages` to store history yourself | Same plus metadata | Use the message API for history, then `toOpenAIInput` / `toAnthropicMessages` to convert into model input |

### 8.3 Correct Usage Examples (note: API uses single-object input)

#### A. Read/write conversation history (bare model / Route A)
```typescript
// Inside an agent endpoint: context.store is available directly
const { store, conversation_id } = context;

// ⭐ Note: the API takes a single-object input — not (id, options) two args
// Read history (cursor pagination supported, limit 1~100)
const history = await store.getMessages({
  conversationId: conversation_id,
  limit: 50,
  order: 'asc',
});

// Convert into model input — don't hand-assemble
const modelInput = store.toOpenAIInput(history);     // or store.toAnthropicMessages(history)

// Append a new message (also single-object input)
await store.appendMessage({
  conversationId: conversation_id,
  role: 'user',
  content: body.message,
});
await store.appendMessage({
  conversationId: conversation_id,
  role: 'assistant',
  content: finalText,
});
```

#### B. Claude Agent SDK (Route B, standalone usage)
```typescript
// Inside an agent endpoint
const sessionStore = context.store.claudeSessionStore();  // no args
// Wire sessionStore into Claude SDK's session persistence.
// In multi-user scenarios, distinguish sessions by conversation_id; reuse goes through resume.
```

#### C. LangGraph / DeepAgents
```typescript
const checkpointer = context.store.langgraphCheckpointer;   // direct property, not a method call
const lgStore = context.store.langgraphStore;               // direct property, not a method call

const graph = workflow.compile({ checkpointer, store: lgStore });
// Use conversation_id as thread_id
await graph.invoke(input, { configurable: { thread_id: conversation_id } });
```

#### D. Read/write inside a cloud-function (plain endpoint)
```typescript
// cloud-functions/preferences/index.ts — no AI, entry is context.agent.store
export async function onRequest(context: any) {
  const store = context.agent?.store;   // ⚠️ not context.store
  if (!store) return Response.json({ ok: false, reason: 'store unavailable' });

  // ✅ The generic message API is identical to the agent endpoint
  const conv = await store.getConversation(conversationId);
  const prefs = conv?.metadata?.preferences ?? defaults;
  await store.updateConversation(conversationId, { metadata: { preferences: nextPrefs } }); // shallow merge

  // ❌ These two are undefined inside cloud-function — the runtime explicitly strips them:
  //    store.langgraphCheckpointer
  //    store.langgraphStore
  // Endpoints that need langgraph KV must move under agents/<name>/ and use context.store.

  return Response.json({ ok: true, prefs });
}
```

### 8.4 Key Limits (read before writing code)

| Limit | Value / Behavior |
|-------|------------------|
| `getMessages` `limit` | 1 ~ 100 |
| Maximum messages per conversation | 10,000 |
| Maximum size of a single `content` | 50MB |
| `langgraphStore.search` | **Does not perform vector retrieval**; `score` is always `undefined` (do not rely on semantic recall) |
| `updateConversation`'s metadata | **Shallow merge** (only top-level keys are overridden; nested objects are replaced wholesale) |
| `appendMessage` / `getMessages` signature | **Single-object input** (`{ conversationId, ... }`), not `(id, options)` |
| Cross-function data sharing | Go through conversation metadata (`updateConversation` / `getConversation`) — simple and reliable |

### 8.5 Anti-Pattern Checklist (priority targets in review)

| ❌ Anti-pattern | ✅ Correct approach |
|-----------------|---------------------|
| Wrap your own `kvGet/kvSet`, simulating KV with `clearMessages`+`appendMessage` | Use the official adapters; long-term data goes through conversation metadata or `langgraphStore` |
| Stuff conversation history into a single message's `content` field as a KV blob | Use `appendMessage`/`getMessages` to store multiple messages normally |
| Bolting a langgraph checkpointer onto Claude SDK | Claude SDK uses `claudeSessionStore()` — it has its own model |
| Calling `store.langgraphStore.get(...)` inside `cloud-functions/` | The runtime strips langgraph adapters from the cloud-function store; endpoints needing langgraph KV must live under `agents/<name>/` and use `context.store` |
| Pseudo-fallback like `store?.langgraphStore ?? store` | Just use `store.langgraphStore` directly; an endpoint that picked the wrong entry should either move directories or switch to the generic message API |
| Using `context.store` inside cloud-function | Cloud-function uses `context.agent.store` |
| Calling `store.getMessages(convId, { limit })` as if it took two args | Single-object input: `store.getMessages({ conversationId, limit })` |
| In-process `new Map()` cache as a persistence layer | Multi-instance / cold start drops it; persist to store messages or metadata |
| One write entry from agent and another from cloud-function for the same preferences | Unify behind conversation metadata — single write entry |
| Hand-assembling the history array to feed the model | Use `toOpenAIInput` / `toAnthropicMessages` for conversion |

---

## 9. Python Runtime Convention (Route E and any future Python routes)

### 9.1 Overview

The Python agent runtime is an ASGI application (uvicorn). It shares the same platform conventions as the Node runtime (file-based routing, `makers-conversation-id` header contract, SSE protocol, etc.), but uses Python idioms.

**Prerequisites**:
- `edgeone.json` must set `agents.runtime: "python"`
- `edgeone.json` must set `agents.framework` to `crewai`, `langgraph`, or `deepagents`
- Dependencies go in `requirements.txt` (not `package.json`)

### 9.2 Entry Signature

```python
# agents/<name>/index.py or agents/<name>.py → POST /<name>
async def handler(ctx):
    """The runtime looks for a top-level `handler` function in each route module."""
    ...
```

- The `handler` function must be `async`.
- The single parameter (`ctx`) is an `AgentContext` dataclass.
- If handler is an **async generator** (`async def handler(ctx): ... yield ...`), the runtime auto-wraps it as a streaming response.

### 9.3 Context Object (`ctx`)

| Field | Type | Description |
|-------|------|-------------|
| `ctx.request.body` | `dict` | Parsed JSON request body |
| `ctx.request.headers` | `dict` | Request headers (lowercase keys, plain dict) |
| `ctx.request.signal` | `asyncio.Event` | Cancellation signal — check with `ctx.request.signal.is_set()` |
| `ctx.request.query` | `dict` | URL query parameters |
| `ctx.env` | `dict` | Environment variables — ⚠️ **never use `os.environ`** |
| `ctx.conversation_id` | `str` | Injected from `makers-conversation-id` header |
| `ctx.run_id` | `str` | Current run ID |
| `ctx.store` | `ConversationMemory` | Message CRUD + LangGraph adapters |
| `ctx.tools` | Tools | Platform tools (lazy-loaded, shaped by `agents.framework`) |
| `ctx.sandbox` | Sandbox | Sandbox client (lazy-loaded) |
| `ctx.kv` | KV store | Per-route KV store |
| `ctx.utils` | `ContextUtils` | SSE helpers + abort utility |
| `ctx.tracer` | Tracer | Manual observability span API |

### 9.4 SSE Streaming

**Recommended pattern** (via `ctx.utils`):

```python
import time

async def handler(ctx):
    message = ctx.request.body.get("message", "")
    if not message:
        return {"error": "'message' is required"}, 400

    async def gen():
        # ... LLM streaming logic ...
        yield ctx.utils.sse({"type": "ai_response", "content": "Hello"})
        yield ctx.utils.sse({"type": "ping", "ts": int(time.time() * 1000)})
        yield ctx.utils.sse({"type": "usage", "input_tokens": 10, "output_tokens": 5})
        yield b"data: [DONE]\n\n"

    return ctx.utils.stream_sse(gen())
```

**Alternative** (explicit `StreamResponse`):

```python
from _platform.context import StreamResponse, sse

async def handler(ctx):
    async def gen():
        yield sse({"type": "ai_response", "content": "World"})
    return StreamResponse.sse(gen())
```

Both approaches produce identical SSE responses with correct headers (`text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive`).

### 9.5 Return Values

Python handlers can return:

| Return type | Runtime behavior |
|-------------|-----------------|
| `dict` / `list` | JSON response (200) |
| `str` | Plain text response (200) |
| `(body, status)` tuple | Response with custom status code |
| `StreamResponse` | Streaming response (via `ctx.utils.stream_sse()` or `StreamResponse.sse()`) |
| async generator | Auto-wrapped as streaming response |

### 9.6 Memory / Store API

Python uses **positional arguments** (not a single-object input like Node):

```python
# Append a message
msg_id = await ctx.store.append_message(ctx.conversation_id, "user", "Hello!")

# Get messages (default: ascending order)
messages = await ctx.store.get_messages(ctx.conversation_id, limit=50)

# Convert to model input format
openai_msgs = ctx.store.to_openai_input(messages)

# LangGraph adapters (direct properties, snake_case)
checkpointer = ctx.store.langgraph_checkpointer
lg_store = ctx.store.langgraph_store
```

### 9.7 Abort / Stop Convention

```python
# agents/stop.py
async def handler(ctx):
    # ⚠️ Read conversation_id from body only (no makers-conversation-id header)
    target = ctx.request.body.get("conversation_id") or ""
    result = ctx.utils.abortActiveRun(target)  # camelCase (aligned with Node)
    # Alias: ctx.utils.abort_active_run(target)
    return {
        "status": "aborted" if result.aborted else "idle",
        "conversation_id": result.conversation_id,
        "run_id": result.run_id,
    }
```

### 9.8 Node ↔ Python Naming Mapping

| Node (TS) | Python |
|-----------|--------|
| `context.request.signal.aborted` | `ctx.request.signal.is_set()` |
| `context.store.appendMessage({conversationId, role, content})` | `await ctx.store.append_message(conversation_id, role, content)` |
| `context.store.getMessages({conversationId, limit})` | `await ctx.store.get_messages(conversation_id, limit=N)` |
| `context.store.langgraphCheckpointer` | `ctx.store.langgraph_checkpointer` |
| `context.store.langgraphStore` | `ctx.store.langgraph_store` |
| `context.store.toOpenAIInput(msgs)` | `ctx.store.to_openai_input(msgs)` |
| `context.utils.abortActiveRun(id)` | `ctx.utils.abortActiveRun(id)` or `ctx.utils.abort_active_run(id)` |
| `createSSEResponse(gen, signal)` | `ctx.utils.stream_sse(gen())` |
| `sseEvent({type, content})` | `ctx.utils.sse({"type": ..., "content": ...})` |

### 9.9 Blocking Code (Critical for Python)

CrewAI's `crew.kickoff()` is **synchronous and blocking**. You MUST offload it to a thread:

```python
import asyncio

async def handler(ctx):
    crew = build_crew(...)
    # ⚠️ WRONG: result = crew.kickoff()  ← blocks event loop, kills heartbeats
    # ✅ RIGHT:
    result = await asyncio.to_thread(crew.kickoff)
```

This applies to any synchronous SDK call (CrewAI, some LangChain tools, file I/O, etc.).
