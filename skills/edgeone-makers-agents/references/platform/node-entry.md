# File Routing + onRequest Entry Convention

> Covers: file-based routing rules, `onRequest` signature, context fields, environment variable iron rule.

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

## `externalNodeModules` (build config, usually not needed)

The CLI uses esbuild to bundle agent code. Some packages cannot be bundled and must remain as separate `node_modules` at runtime. The CLI **auto-externalizes** the most common ones:

| Auto-externalized (no config needed) | Reason |
|--------------------------------------|--------|
| `deepagents` | Default external |
| `@anthropic-ai/claude-agent-sdk` | Default external |
| All `@langchain/*` packages | Auto-detected from `package.json` |
| OpenTelemetry packages | Observability layer handles it |

**You only need to manually add `externalNodeModules`** when a package that is NOT in the list above fails to bundle. Common symptoms:
- `Dynamic require of "xxx" is not supported`
- `Cannot find module 'xxx'` at runtime (but it's in node_modules)
- Native `.node` addon fails to load

Example (only if needed):
```json
{
  "agents": {
    "framework": "openai-agents-sdk",
    "externalNodeModules": ["openai", "@openai/agents"]
  }
}
```

**Packages that may need manual externalization**:

| Package | When to add |
|---------|-------------|
| `openai` | If using OpenAI Agents SDK and build fails |
| `@openai/agents` | Same as above |
| `sharp` | If doing image processing (native addon) |
| `puppeteer-core` | If using browser automation (native deps) |
| `bcrypt` | Native C++ addon |
