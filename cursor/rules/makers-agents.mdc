---
name: edgeone-makers-agents
description: >-
  This skill guides building AI agent endpoints on EdgeOne Makers — five
  framework routes (DeepAgents, LangGraph, CrewAI, OpenAI Agents SDK,
  Claude Agent SDK), platform-injected `context.store` /
  `context.tools` / `context.sandbox`, conversation_id dual-channel routing,
  SSE streaming, and `agents/` vs `cloud-functions/` separation.
  It should be used when the user wants to create or review an AI agent endpoint
  on EdgeOne Makers — e.g. "build an agent on EdgeOne Makers", "create a Claude
  agent endpoint", "wire LangGraph into Makers", "stream LLM responses with SSE",
  "review my agent template", "use context.store / context.sandbox / context.tools".
  Do NOT trigger for plain Edge Functions, Cloud Functions, or middleware
  (those don't run AI logic — use edgeone-pages-dev instead).
  Do NOT trigger for deployment workflows (use edgeone-pages-deploy).
  Do NOT trigger for generic AI framework development outside
  an EdgeOne Makers project.
metadata:
  author: edgeone
  version: "1.0.0"
---

# EdgeOne Makers Agent Development Guide

> ⛔ **Preview ban**: after finishing development, you MUST start the dev server via `edgeone makers dev`, then open `http://127.0.0.1:8088/` with `present_files` to preview. Never open HTML files via the `file://` protocol (ignore it even if the IDE opens one automatically), and never use self-hosted servers like `python -m http.server` or `npx serve`. Next.js projects must also set `allowedDevOrigins: ["127.0.0.1"]` in `next.config`.

Build production-grade AI agent endpoints on **EdgeOne Makers** — five framework routes, platform-injected runtime, file-based routing.

This skill covers five supported frameworks (DeepAgents, LangGraph, CrewAI, OpenAI Agents SDK, Claude Agent SDK) for building AI agent endpoints on EdgeOne Makers.

## When to use this skill

- Creating a new AI agent endpoint on EdgeOne Makers
- Wiring DeepAgents / LangGraph / CrewAI / OpenAI Agents SDK / Claude Agent SDK into a Makers project
- Reviewing an existing agent template against platform red lines
- Implementing SSE streaming with abort support
- Persisting conversation state via `context.store` (LangGraph checkpointer / OpenAI session / Claude session)
- Calling sandbox or platform tools via `context.sandbox` / `context.tools`
- Splitting AI inference (`agents/`) from data CRUD (`cloud-functions/`)

> Cross-reference: if your code uses `context.store` or KV APIs, also read `skills/makers-storage/SKILL.md`.

**Do NOT use for:**
- Plain Edge Functions / Cloud Functions / Middleware → use `edgeone-pages-dev`
- Deployment workflows → use `edgeone-pages-deploy`
- Generic AI framework development outside an EdgeOne Makers project
- Other platforms (Cloudflare Workers AI, Vercel AI SDK, AWS Bedrock)

## How to use this skill (for a coding agent)

1. Skim the **Mental Model** below — Makers ≠ generic API routes
2. Walk the **Decision Tree** to pick one of the five framework routes
3. Read the matching `references/*-route.md` for a copy-paste skeleton
4. Self-check against the **Twelve Red Lines**
5. Run through `references/review-checklist.md` before considering the work done

## ⛔ Critical Rules (never skip)

1. **File-based routing is automatic.** `agents/<name>/index.ts` or `agents/<name>.ts` becomes `POST /<name>`. Never hand-edit `.edgeone/agent-node/config.json`.
2. **Entry signature is fixed.** TS: `export async function onRequest(context: any)`. Python: `async def handler(ctx):`. Method-specific variants (`onRequestPost`, `onRequestGet`, etc.) also work for TS.
3. **Read env via `context.env`, never `process.env` / `os.environ`.** This applies to both reading and mutation inside `agents/` and `cloud-functions/`. Frontend code (`app/`, `src/`) is unaffected.
4. **Headers are plain objects, not the Web `Headers` API.** Use `context.request.headers['x-custom-header']`, never `.get('x')`.
5. **Conversation ID contract.** AI endpoints (`/chat`, `/outline`, etc.) MUST receive the `makers-conversation-id` HTTP header from the frontend. The `/stop` endpoint takes a `conversation_id` in the request body to identify which running conversation to cancel.
6. **Do not hardcode model name / base URL / API key.** Read `AI_GATEWAY_API_KEY` + `AI_GATEWAY_BASE_URL` (+ optional `AI_GATEWAY_MODEL`) from `context.env`. If your template uses `context.tools.web_search`, also configure `WSA_API_KEY` (Tencent Cloud WSAPI).
7. **SSE protocol is a recommended convention (not enforced by the runtime).** The runtime only forwards raw chunks — it does not parse or validate SSE content. The recommended event types are: `ai_response` / `tool_call` / `tool_result` / `usage` / `suggest_actions` / `file_output` / `ping` / `error_message`. Stream ends with `data: [DONE]\n\n`. All frameworks should follow this for frontend consistency.
8. **Heartbeat + buffering control are mandatory.** Send a `ping` event every 5 s. Response headers must include `X-Accel-Buffering: no`, `Cache-Control: no-cache`, `Connection: keep-alive`.
9. **Always honor `context.request.signal`.** Check `signal?.aborted` (TS) or `signal.is_set()` (Python) inside loops; exit gracefully on abort, do not throw.
10. **Cap your loops.** Manual bind-tools loops use a hard turn limit (e.g. `for (let i = 0; i < 4; i++)`); SDK routes set `maxTurns`. No unbounded "until model says stop" loops.
11. **Errors must not crash the stream.** Wrap every model / tool call in try/catch. Swallow `AbortError` silently. Emit other errors as `error_message` events without ending the stream prematurely.
12. **Pick the right `store` entry point — they are NOT shape-equivalent.**
    - `context.store` (agent endpoints, `agents/<name>/`): full `AgentMemory`, includes **all** adapters (`openaiSession`, `claudeSessionStore`, `langgraphCheckpointer`, `langgraphStore`).
    - `context.agent.store` (cloud-function endpoints, `cloud-functions/<name>/`): runtime **strips** `langgraphCheckpointer` and `langgraphStore`. Only generic message API + `openaiSession` + `claudeSessionStore` are available.
    - **Consequence**: any endpoint that needs `langgraphStore.get/put` MUST live under `agents/`. Putting it in `cloud-functions/` will throw `kv.get is not a function` at runtime.
    - Never write `store?.langgraphStore ?? store` as a fake fallback — in cloud-function context this falls back to the store itself, which has no `.get`, and crashes.
13. **Use injected `context.sandbox` / `context.tools`.** Do not hand-write `/v1/sandbox/*` calls or parse tokens. `context.tools` shape is determined by `edgeone.json`'s `agents.framework` (`claude-agent-sdk` / `openai-agents-sdk` / `langgraph` / `crewai` / `deepagents` — there is **no `basic`**). Use `context.tools.all()`, `.get(name)`, `.files()`, `.browser()`. Sandbox: `sandbox.runCode(...)` is **top-level** (not `code_interpreter.runCode`); `screenshot({ fullPage: true })` takes an object, not a boolean; timeout is in **seconds**.

> Note: red line numbering jumps from 12 to 13 deliberately — twelve was the original count; #12 absorbs the store-shape correction with sub-bullets, #13 was added for sandbox/tools to match the breadth of the other rules.

---

## Mental Model

EdgeOne Makers Agent **is not** a generic API route pattern (not Vercel AI SDK's `route.ts`, not Express). It has its own runtime conventions.

| Dimension | EdgeOne Makers convention | ⚠️ Common mistake |
|-----------|---------------------------|-------------------|
| Backend entry | `agents/<name>/index.ts` or `agents/<name>.ts` (Python: `.py`) | ❌ NOT `app/api/<name>/route.ts` |
| Function signature | `export async function onRequest(context)` (Python: `async def handler(context)`) | ❌ NOT `export async function POST(req)` |
| Request body | `context.request.body` (already parsed) | ❌ NOT `await req.json()` |
| Request headers | `context.request.headers['x-foo']` (plain object) | ❌ NOT `headers.get('x-foo')` (silently returns undefined) |
| Environment | `context.env.AI_GATEWAY_API_KEY` (runtime-injected) | ❌ NOT `process.env.X` / `os.environ` (banned in agents/ and cloud-functions/) |
| Model access | `context.env.AI_GATEWAY_*` → Makers AI Gateway | ❌ NOT direct OpenAI / Anthropic |
| Platform capabilities | `context.tools` / `context.sandbox` / `context.store` injected by runtime | ❌ NOT importing the SDK yourself |
| Route registration | Auto-scanned at build time → `.edgeone/agent-node/config.json` | ❌ Don't write that file by hand |

> **The core idea**: you write a thin handler that runs inside the EdgeOne Agent Node Runtime (or Python Runtime). The platform injects the model gateway, sandbox, tools, and session store via `context`. Your code stays thin and leans on the runtime.

---

## Standard Project Layout

```
<template-name>-edgeone/
├── agents/                          # ⭐ Agent backend (core)
│   ├── _shared.ts                   # Shared: logger + SSE helper
│   ├── _model.ts                    # Shared: model name + Gateway env mapping
│   ├── <action>.ts                  # Simple agent: single file → POST /<action>
│   └── <action>/                    # Complex agent: directory form
│       ├── index.ts                 # onRequest entry → POST /<action>
│       ├── _skills.ts               # System prompt builder (optional)
│       ├── _tools.ts                # Custom / MCP tool definitions (optional)
│       └── _templates.ts            # Output templates / default data (optional)
├── app/ or src/                         # Frontend (any framework: Next.js, Vite, plain HTML, etc.)
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── components/
│   └── lib/                         # Frontend utils (context, hooks, conversation-id)
├── lib/                             # Cross-cutting utils (i18n, helpers)
├── cloud-functions/                 # ⭐ Data persistence functions (separate from agents)
│   ├── _logger.ts
│   └── <resource>/index.ts          # e.g. articles/, preferences/, history/, health/
├── .edgeone/
│   └── project.json                 # { Name, ProjectId }
├── edgeone.json                     # Deployment config + agents.framework
├── .env.example                     # ⚠️ MUST exist: declares AI_GATEWAY_API_KEY= and AI_GATEWAY_BASE_URL=
├── package.json                     # TS routes (A/B/C/D)
├── requirements.txt                 # ⭐ Python route (E) only
└── README.md
```

### Layout principles

- **`agents/` = AI inference**: model calls, streaming, tool calling. Each file/directory is one SSE endpoint.
- **`cloud-functions/` = data CRUD**: KV/Blob reads/writes, health checks, history. Returns JSON; not streamed.
- **`_`-prefixed files = internal modules**: not routed; imported by siblings only.
- **`_shared.ts`, `_model.ts`, `_tools.ts` are internal**; `index.ts`, `create.ts` are endpoints.
- **Pick TS or Python per template**, do not mix in one project.

---

## edgeone.json Configuration

The `edgeone.json` file is the deployment configuration file for EdgeOne Makers projects. It defines the build command, output directory, and agent-specific settings.

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `buildCommand` | string | Build command (e.g., `npm run build`) |
| `outputDirectory` | string | Build output directory (e.g., `.next`, `dist`, `build`) |
| `framework` | string | Frontend framework (e.g., `nextjs`, `vite`, `react`) |
| `cloudFunctions` | object | Cloud functions configuration |
| `agents` | object | **Agent-specific settings (important!)** |

### `agents.framework` — Console Icon Display

The `agents.framework` field in `edgeone.json` tells the EdgeOne Makers console which icon to display for your project. **This is required for the console to show the correct framework icon.**

Available values:

| Value | Framework | Console Icon |
|-------|-----------|---------------|
| `claude-agent-sdk` | Claude Agent SDK | Claude |
| `openai-agents-sdk` | OpenAI Agents SDK | OpenAI |
| `langgraph` | LangGraph / DeepAgents | LangGraph |
| `crewai` | CrewAI | CrewAI |
| `deepagents` | DeepAgents | DeepAgents |

**⚠️ Important**: If `agents.framework` is not set or set to an unrecognized value, the console will show a generic icon (not the framework-specific icon).

### Example `edgeone.json`

```json
{
  "buildCommand": "npm run build",  // your frontend build command
  "outputDirectory": "dist",
  "cloudFunctions": {
    "nodejs": {
      "includeFiles": []
    }
  },
  "agents": {
    "framework": "claude-agent-sdk"
  }
}
```

---

## Technology Decision Tree

Pick one of the five framework routes:

```
Need a sandbox to run code, process uploaded files, or use MCP tools?
├─ Yes → Claude Agent SDK
└─ No ↓
   Need multi-agent handoff?
   ├─ Yes → OpenAI Agents SDK
   └─ No ↓
      Need fine-grained graph control (nodes, edges, human-in-the-loop)?
      ├─ Yes → LangGraph
      └─ No ↓
         Want multi-agent role split (Sequential/Hierarchical)?
         ├─ Yes → CrewAI (Python only)
         └─ No → DeepAgents (simplest, auto context compression)
```

### Framework Comparison

| Framework | Runtime | Best For |
|-----------|---------|----------|
| **DeepAgents** | Node + Python | Simple agent tasks, automatic context compression, sub-agent orchestration |
| **LangGraph** | Node + Python | Fine-grained graph control, human-in-the-loop, persistent thread state |
| **Claude Agent SDK** | Node + Python | Sandbox code execution, file processing, MCP tools, session memory |
| **OpenAI Agents SDK** | Node + Python | Multi-agent handoff, guardrails, session auto-prepend |
| **CrewAI** | Python only | Multi-agent role split (Sequential/Hierarchical), built-in skills/event_bus |

---

## Routing

| Topic | Read |
|-------|------|
| Node entry (onRequest, context, AbortSignal) | [platform/node-entry.md](references/platform/node-entry.md) |
| Python entry (handler, ctx, asyncio.Event) | [platform/python-entry.md](references/platform/python-entry.md) |
| Environment variables + model convention | [platform/env-and-model.md](references/platform/env-and-model.md) |
| SSE streaming protocol | [platform/sse-protocol.md](references/platform/sse-protocol.md) |
| conversation-id dual-channel + frontend | [platform/conversation-id.md](references/platform/conversation-id.md) |
| agents/ vs cloud-functions/ separation | [platform/cloud-functions.md](references/platform/cloud-functions.md) |
| Store (context.store) | [capabilities/store.md](references/capabilities/store.md) |
| Sandbox (context.sandbox) | [capabilities/sandbox.md](references/capabilities/sandbox.md) |
| Tools (context.tools) | [capabilities/tools.md](references/capabilities/tools.md) |
| Claude Agent SDK (Node) | [node-frameworks/claude-sdk.md](references/node-frameworks/claude-sdk.md) |
| OpenAI Agents SDK (Node) | [node-frameworks/openai-agents.md](references/node-frameworks/openai-agents.md) |
| LangGraph (Node) | [node-frameworks/langgraph.md](references/node-frameworks/langgraph.md) |
| DeepAgents (Node) | [node-frameworks/deepagents.md](references/node-frameworks/deepagents.md) |
| Claude Agent SDK (Python) | [python-frameworks/claude-sdk.md](references/python-frameworks/claude-sdk.md) |
| OpenAI Agents SDK (Python) | [python-frameworks/openai-agents.md](references/python-frameworks/openai-agents.md) |
| LangGraph (Python) | [python-frameworks/langgraph.md](references/python-frameworks/langgraph.md) |
| DeepAgents (Python) | [python-frameworks/deepagents.md](references/python-frameworks/deepagents.md) |
| CrewAI (Python only) | [python-frameworks/crewai.md](references/python-frameworks/crewai.md) |
| Review checklist | [review-checklist.md](references/review-checklist.md) |

---

## Environment Setup

### Install the EdgeOne CLI

```bash
npm install -g edgeone
```

Verify: `edgeone -v`.

### Set environment variable

Before executing **any** `edgeone` CLI command (`makers init`, `makers dev`, `makers link`, `makers env pull`, etc.), set:

```bash
export PAGES_SOURCE=skills
```

Or prefix each command inline:

```bash
PAGES_SOURCE=skills edgeone makers dev
```

This tells the platform that the command was triggered from an AI skill context.

### Local development

```bash
# 1. Link to remote project (pulls project ID + env vars)
PAGES_SOURCE=skills edgeone makers link

# 2. Pull remote environment variables to local .env
PAGES_SOURCE=skills edgeone makers env pull
```

### Environment variables for deployment

> ⛔ **You MUST create a `.env.example` file**: the CLI uses this file to decide which variables to auto-inject. If the project has no `.env.example`, or it does not declare `AI_GATEWAY_*`, the environment variables will not be injected after deployment, and the Agent will error at runtime due to the missing API Key.

**AI Gateway variables** (`AI_GATEWAY_API_KEY`, `AI_GATEWAY_BASE_URL`) are **auto-provisioned** by the CLI during deployment — no manual setup needed, as long as `.env.example` declares them:

```env
# .env.example (MUST be committed to the repo)
AI_GATEWAY_API_KEY=
AI_GATEWAY_BASE_URL=
```

The CLI will detect these declarations and automatically fetch + inject the values at deploy time.

**User-defined business variables** must be set manually before deployment:

```bash
# Set a variable on the remote project
edgeone makers env set MY_SECRET_KEY "my-value"

# List current variables
edgeone makers env ls

# Pull remote variables to local .env (for dev)
edgeone makers env pull
```

**Common variables to set for Agent projects**:

| Variable | When needed | How to set |
|----------|-------------|------------|
| `AI_GATEWAY_API_KEY` | Always | Auto-provisioned by CLI |
| `AI_GATEWAY_BASE_URL` | Always | Auto-provisioned by CLI |
| `WSA_API_KEY` | If using `web_search` tool | `edgeone makers env set WSA_API_KEY <value>` |
| Custom business keys | Per project | `edgeone makers env set <KEY> <VALUE>` |

> ⚠️ **Before deploying an Agent project**, ensure all required environment variables are either auto-provisioned (AI_GATEWAY_*) or manually set via `edgeone makers env set`. Missing variables will cause runtime 500 errors.

---

## Standard Operating Procedure

### Reviewer SOP

1. Run `find . -type d -name agents -o -name cloud-functions` to confirm directory shape.
2. Open `edgeone.json`, read `agents.framework` to identify the route.
3. Walk through `references/review-checklist.md` from section A onward.
4. When a violation is found, cite the matching Critical Rule + the "remediation table" at the end of the checklist.
5. Top high-frequency issues to attack first (in order of observed frequency):
   1. ❌ `process.env.X` / `os.environ` inside agents (use `context.env`); **mutation also counts**: `process.env.X = '...'` is a violation too
   2. ❌ `headers.get('x')` (use `headers['x']`)
   3. ❌ Hand-maintained `.edgeone/agent-node/config.json` (delete it). ⚠️ **How to judge**: check whether `.gitignore` includes `.edgeone`. If yes → the local `config.json` is a build artifact, not a violation. If no → the whole `.edgeone/` is committed, that's the violation.
   4. ❌ Writing `sandbox.code_interpreter.runCode(...)` (it's `sandbox.runCode(...)`, top-level); `screenshot(true)` should be `screenshot({ fullPage: true })`
   5. ❌ `/stop` carrying `makers-conversation-id` header (use body only)
   6. ❌ Frontend fetch to AI endpoints missing `makers-conversation-id` header
   7. ❌ `edgeone.json` missing `agents.framework` (default `'claude-agent-sdk'` may not match actual framework, breaks `context.tools` shape)

### Developer SOP

1. Pick a framework via the Decision Tree above.
2. Copy the skeleton from the matching framework reference doc.
3. Configure `edgeone.json`: set `agents.framework` correctly.
4. Frontend: `getOrCreateConversationId` + `fetch` with `makers-conversation-id` header.
5. Get it running → self-check against the Critical Rules → run through `references/review-checklist.md`.

### Pre-Deploy SOP (⚠️ MUST execute before `edgeone makers deploy`)

> **This section is critical.** AI agents MUST follow these steps when helping a user deploy. Skipping them will cause runtime 500 errors in production.

1. **Scan for environment variables in the project**:
   - Check `.env`, `.env.example`, `.env.local` for all declared variables
   - Scan source code for `context.env.XXX` / `ctx.env.get("XXX")` references to identify required variables
   - Common patterns: `SUPABASE_URL`, `SUPABASE_KEY`, `DATABASE_URL`, `WSA_API_KEY`, custom API keys, etc.

2. **Classify variables**:
   - `AI_GATEWAY_API_KEY` + `AI_GATEWAY_BASE_URL` → **auto-provisioned** (no action needed if `.env.example` declares them)
   - All other variables → **must be manually uploaded**

3. **Upload non-auto-provisioned variables**:
   ```bash
   # For each variable the project needs:
   edgeone makers env set <KEY> "<VALUE>"
   ```
   If the user has not provided the values, **ask the user** for them before deploying. Do NOT deploy without confirming all required variables are set.

4. **Verify** (optional but recommended):
   ```bash
   edgeone makers env ls
   ```

5. **Deploy**:
   ```bash
   edgeone makers deploy
   ```

**Example interaction when deploying a project with Supabase**:

> The project uses the following environment variables:
> - `AI_GATEWAY_API_KEY` — auto-provisioned ✓
> - `AI_GATEWAY_BASE_URL` — auto-provisioned ✓
> - `SUPABASE_URL` — needs manual setup
> - `SUPABASE_ANON_KEY` — needs manual setup
>
> Please provide the values for `SUPABASE_URL` and `SUPABASE_ANON_KEY`, and I'll set them before deploying.

---
