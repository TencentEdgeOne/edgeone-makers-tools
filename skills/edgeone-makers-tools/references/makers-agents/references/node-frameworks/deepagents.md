# DeepAgents (Node)

## Contents

- [Dependencies](#dependencies)
- [When to Pick DeepAgents](#when-to-pick-deepagents)
- [Core Pattern](#core-pattern)
- [Memory](#memory)
- [Review Checklist](#review-checklist)

> Use when: long-running tasks with automatic context compression, sub-agent orchestration, middleware (retry/call-limit).
> Core pattern: `createDeepAgent({ model, systemPrompt, tools, middleware })` + `agent.stream({ messages }, { streamMode })`.

---

## Dependencies

```bash
npm install deepagents@1.13.3 @langchain/core@^1.2.9 @langchain/langgraph@^1.4.14 @langchain/langgraph-checkpoint@^1.1.5 @langchain/langgraph-sdk@^1.9.23 @langchain/openai@1.5.8 langchain@^1.5.10 langsmith@^0.9.0 zod@^4.3.6
```

> ⛔ **Declare the langchain/langgraph packages explicitly — do not rely on npm installing them for you.** `deepagents` 1.10.6 moved `langchain`, `langsmith`, `@langchain/langgraph`, `@langchain/langgraph-sdk` and `@langchain/langgraph-checkpoint` out of `dependencies` and into `peerDependencies`. npm 7+ installs peers automatically, so a project that declares only `deepagents` still imports fine locally and in preview. It fails in production: the runtime resolves auto-externalized packages from what `package.json` declares, so an undeclared peer is simply not there, and `import 'deepagents'` dies with `Cannot find package 'langchain'` before `onRequest` is ever called. Every route then hangs until the gateway times out and returns an HTML 500 — including routes that only validate input, which is what distinguishes this from a missing API key.

> **Every package above carries a version, and that is the point.** A range on `deepagents` beside a bare peer list is what broke twice: the range said `^1.9.0` while the list described what 1.9 needed and npm resolved 1.13, and later a bare `@langchain/core` resolved to the 0.3 line while `deepagents` 1.13.3 peered on `^1.2.9` — an `ERESOLVE` before a single file of the app was written. `deepagents` is pinned exactly because its `peerDependencies` are what the rest of this line satisfies; the two move together or not at all.

> Two of these versions are not simply "the latest". `@langchain/openai` is held at 1.5.8 because 1.5.9 raised its engine floor to Node 22 and the sandbox runs Node 20 — npm reports that as a warning and installs anyway, so nothing fails until the package does. `langsmith` is capped below 0.10 because that is where the `deepagents` peer range ends, while the registry's latest is already past it.

> The list is still not the source of truth. If a resolved `deepagents` moves another package between `dependencies` and `peerDependencies`, read `node_modules/deepagents/package.json` and declare what it asks for. When that happens, re-bake rather than editing this line alone: `templates/deepagents` is generated from the command above and a test fails when the two disagree.

> **Note**: `deepagents` is a platform-provided package bundled with the EdgeOne Makers agent runtime. It is automatically available in the deployed environment.
`edgeone.json`:
```json
{
  "agents": {
    "framework": "deepagents"
  }
}
```

> `deepagents` and all `@langchain/*` packages are **auto-externalized** by the CLI — no manual `externalNodeModules` config needed.

---

## When to Pick DeepAgents

✅ Good fit:
- Long agent tasks (writing, research) — automatic context compression saves manual work
- Sub-agent orchestration with isolated context
- Multi-step research workflows (search → deep-read → cite → produce)

❌ Not a fit:
- Need fine-grained graph control (nodes, edges, conditional routing) → use LangGraph
- Need a sandbox to run code → Route B (Claude Agent SDK)
- Multi-agent handoff → Route C (OpenAI Agents SDK)

---

## Core Pattern

### 1. Model initialization

```typescript
import { ChatOpenAI } from '@langchain/openai';

const MODEL_NAME = '@makers/deepseek-v4-flash';

let _model: ChatOpenAI | null = null;
function getModel(env: Record<string, string>): ChatOpenAI {
  if (_model) return _model;
  _model = new ChatOpenAI({
    model: MODEL_NAME,
    apiKey: env.AI_GATEWAY_API_KEY,
    configuration: { baseURL: env.AI_GATEWAY_BASE_URL },
    temperature: 0,
    timeout: 300_000,
  });
  return _model;
}
```

### 2. Agent assembly with middleware

```typescript
import { createDeepAgent } from 'deepagents';

let _agent: any = null;
function getAgent(model: any) {
  if (_agent) return _agent;
  _agent = createDeepAgent({
    model,
    systemPrompt: 'You are a helpful research assistant.',
    tools: [internetSearch],
  });
  return _agent;
}
```

> The agent loop is capped by `recursionLimit` on the **call**, not by a constructor option — see the `agent.stream` config below. `createDeepAgent` took a `maxTurns` once and no longer does; passing it now is accepted silently by JavaScript and read by nothing, so the cap is simply absent.

### 3. Sub-agent orchestration

```typescript
import { createDeepAgent } from 'deepagents';

const researchAgent = createDeepAgent({
  model,
  systemPrompt: 'You are a research expert.',
  tools: [internetSearch, fetchWebpage],
});

const writerAgent = createDeepAgent({
  model,
  systemPrompt: 'You are a writer.',
  tools: [],
  subAgents: [
    {
      name: 'research_specialist',
      description: 'Use this for in-depth research tasks',
      agent: researchAgent,
    },
  ],
});
```

> Sub-agent state is automatically isolated — the parent only sees the final result.

### 4. Streaming SSE

```typescript
async function* eventStream(agent: any, messages: ChatMessage[], conversationId: string, signal?: AbortSignal) {
  try {
    const stream = await agent.stream(
      { messages },
      {
        streamMode: 'messages',
        signal,
        recursionLimit: 30,
        configurable: { thread_id: conversationId },
      },
    );
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const [msg] = chunk;
      if (msg.tool_call_chunks?.length) {
        for (const tc of msg.tool_call_chunks) {
          if (tc.name) yield sseEvent({ type: 'tool_call', name: tc.name });
        }
      } else if (msg.type === 'tool') {
        yield sseEvent({ type: 'tool_result', name: msg.name, content: msg.text?.slice(0, 500) ?? '' });
      } else if (msg.text) {
        yield sseEvent({ type: 'ai_response', content: msg.text });
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError' && !signal?.aborted) {
      yield sseEvent({ type: 'error_message', content: (e as Error).message });
    }
  }
  yield 'data: [DONE]\n\n';
}
```

### 5. onRequest entry

```typescript
type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function onRequest(context: any) {
  const { request, env, conversation_id: conversationId } = context;

  // `messages` and nothing else — the one body a chat UI sends, and the one the
  // preview probe exercises. See platform/conversation-id.md: a handler that
  // also accepts a singular `message` has a second branch no client reaches,
  // and a mistake in it ships answering every real request 400.
  const messages: ChatMessage[] = (Array.isArray(request?.body?.messages) ? request.body.messages : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim());
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "'messages' is required" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signal = request?.signal as AbortSignal | undefined;
  const agent = getAgent(getModel(env));

  return createSSEResponse((sig) => eventStream(agent, messages, conversationId, sig), signal);
}
```

---

## Memory

DeepAgents reuses LangGraph's memory adapters:

```typescript
const checkpointer = context.store.langgraphCheckpointer;  // direct property
const lgStore = context.store.langgraphStore;              // direct property
```

---

## Review Checklist

- [ ] `edgeone.json` has `agents.framework: "deepagents"`
- [ ] `package.json` declares every `deepagents` peer, not just `deepagents` itself — an undeclared peer passes preview and breaks the deployed route
- [ ] `/chat` reads `messages` and has no singular `message` branch
- [ ] Model/agent instances cached as module-level singletons
- [ ] env from `context.env` — never `process.env`
- [ ] `recursionLimit` is set on the `stream` call to cap agent loops — `maxTurns` on `createDeepAgent` is read by nothing
- [ ] Streaming uses `streamMode: 'messages'`
- [ ] Signal forwarded and checked inside the loop
- [ ] Stream ends with `data: [DONE]\n\n`
