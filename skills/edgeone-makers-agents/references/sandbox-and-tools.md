# Sandbox + Tools Quick Reference (pages-agent-toolkit)

> Platform-capability spec: `context.sandbox` (sandbox) and `context.tools` (LLM tool registry).
> Source of truth: `@edgeone/pages-agent-toolkit` (internal, this is what the runtime actually bundles) / `@tencent/pages-agent-toolkit` (external mirror, may lag); cross-check against `tef-cli/src/agent/runtime.ts`. Always pin to `@latest`, never lock a version.
> Use alongside `platform-conventions.md`; together with `memory-store.md` (store), these form the three platform capabilities of Makers.

---

## 0. First Principle: Use Runtime Injection, Don't Roll Your Own

- Inside Pages Agent templates, **always use the injected `context.sandbox` / `context.tools`** (Python: `ctx.sandbox` / `ctx.tools`).
- **Do not** re-parse tokens, hand-write `/v1/sandbox/*` requests, or manually construct a sandbox in business code.
- `context.sandbox` is **lazily loaded** on first access; auth / ProjectId / control-plane env are injected by the runtime or the CLI deploy pipeline. Template `.env` files **do not** need to carry sandbox tickets, PROJECT_ID, SANDBOX_API_BASE, or API_ENV.
- Only use `buildSandboxProxy` / `build_sandbox` for manual construction when **outside the Pages Agent runtime** and connecting an SDK directly to the control plane.

> ⚠️ Distinguish two classes of env:
> - `AI_GATEWAY_API_KEY` / `AI_GATEWAY_BASE_URL` are **business variables for the LLM gateway** (required by the agent)
> - Sandbox tickets (`sandbox.v1.*` sealed token) are **sandbox-auth variables** injected by the deploy pipeline; they are **not** AI Gateway variables

---

## ⚠️ Must-Read: Sandbox `/tmp/` Is Easily Lost Across Requests

**This is a platform-level characteristic, not a per-framework limitation:**
- Even when the same `conversation_id` is sticky-routed to the same sandbox instance, files in the sandbox `/tmp/` **may be cleaned between requests**.
- Scenario: on the first `/chat` request the user uploads an image to `/tmp/foo.jpg` and the AI returns a result; on a later request asking "compress that image", `/tmp/foo.jpg` may already be gone.

**Correct approach (Route B / Claude SDK template pattern):**
1. Cache uploaded files on the backend in a module-level `Map<conversationId, Array<{ name, base64 }>>`
2. At the start of every request, re-write the cached files back to the sandbox at `/tmp/<name>`
3. This way the AI can always find the files regardless of whether `/tmp/` was cleaned

**Anti-patterns:**
- Assuming `/tmp/foo.jpg` still exists on the second request → AI hits `FileNotFoundError`, and the model may "hallucinate" a fake image as the response
- The system prompt must explicitly forbid this: on `FileNotFoundError`, the model must stop and never fabricate a file

---

## 1. Sandbox API (context.sandbox)

| Module | Method | Notes |
|------|------|------|
| **commands** | `run(cmd, {cwd?, env?, user?, timeout?})` → `{stdout, stderr, exitCode}` | Shell execution; **timeout is in seconds**; also used to download/generate binary assets |
| **files** | `read` / `write` / `list` / `makeDir` / `exists` / `remove` | ⚠️ `write(path, content)` **only accepts UTF-8 strings**; binary content must be produced inside the sandbox via `commands.run('base64 -d ...')` |
| **browser** | `goto` / `screenshot({fullPage?})` / `click` / `type` / `evaluate` / `getContent` / `close`; properties `cdpUrl` / `liveUrl` | CDP attached to a real Chromium (driven by Playwright); `screenshot` takes an **object** `{ fullPage?: boolean }` and returns `{ base64Image }` (the boolean form `screenshot(true)` is not a valid signature) |
| **runCode** ⭐ | `sandbox.runCode(code, {language?, timeout?})` → `{results, logs, error}` | Jupyter kernel; variables persist across calls. ⚠️ This is a **top-level method** on `context.sandbox` — there is no `code_interpreter` namespace, so do not write `sandbox.code_interpreter.runCode(...)` |
| Control | `getInfo()` / `extendTimeout(seconds)` / `kill()` / `envdAccessToken` / `getHost(port)` | Inspect instance, extend lifetime, terminate |

```typescript
// Inside an agent endpoint: use the injected sandbox directly
const result = await context.sandbox.commands.run('echo "hello"', { timeout: 10 })  // 10 seconds
await context.sandbox.files.write('/tmp/a.txt', 'utf8 content')
const shot = await context.sandbox.browser.screenshot({ fullPage: true })  // {base64Image}
const exec = await context.sandbox.runCode('print(1+1)', { language: 'python' })  // top-level method, {results, logs, error}
await context.sandbox.extendTimeout(900)                      // extend by 900 seconds
```

```python
result = await ctx.sandbox.commands.run('echo "hello"', timeout=10)
```

---

## 2. Tools Registry (context.tools)

`context.tools` is built by `toolkit.buildTools(framework, sandbox)` during lazy load, and **its shape is determined by `agents.framework` in `edgeone.json`**.

### 2.1 ToolsContext Interface (@edgeone/pages-agent-toolkit)

```typescript
interface ToolsContext {
  // —— Flat per-operation tool properties (each is a single tool object, not a method) ——
  readonly commands: FrameworkTool;
  readonly files_read: FrameworkTool;
  readonly files_write: FrameworkTool;
  readonly files_list: FrameworkTool;
  readonly files_exists: FrameworkTool;
  readonly files_remove: FrameworkTool;
  readonly files_make_dir: FrameworkTool;
  readonly browser_fetch: FrameworkTool;
  readonly browser_screenshot: FrameworkTool;
  readonly browser_click: FrameworkTool;
  readonly browser_type: FrameworkTool;
  readonly browser_evaluate: FrameworkTool;
  readonly code_interpreter: FrameworkTool;
  readonly web_search: FrameworkTool;
  // —— Methods ——
  all(): FrameworkTool[];                                  // array of all tools
  get(name: string): FrameworkTool | undefined;            // get a single tool
  files(): FrameworkTool[];                                // file-group tools array (exists!)
  browser(): FrameworkTool[];                              // browser-group tools array (exists!)
  toClaudeMcpServer(name?, options?): { name, tools, allowedTools };  // Claude-SDK only (exists!)
}
```

⭐ **Key usage:**
- `toClaudeMcpServer('edgeone', { alwaysLoad: true })` returns `{ name, tools, allowedTools }` (`allowedTools` shaped like `mcp__edgeone__commands`). This capability is **specific to the Claude Agent SDK route** (not relevant to plain Node/Python) and is the recommended way to wire tools in claude-sdk templates.
- `files()` / `browser()` are callable methods returning the tool array for the corresponding group.
- Flat properties such as `commands` / `files_read` / `files_write` / `browser_screenshot` / `web_search` give you each tool individually.

> ⚠️ `toLangChainTools()` / `toCrewAITools()` are Python-only helpers; Node templates do not need them (just call `all()`).

### 2.2 How the Five Frameworks Wire Up Tools on EdgeOne

Set `agents.framework` in `edgeone.json`, and `context.tools.all()` will return tools already in that framework's format:

| Framework | `agents.framework` | How to fetch tools | Notes |
|------|---------------------|-----------|------|
| **Claude Agent SDK** | `'claude-sdk'` | `const tools = context.tools.all()` → feed straight into `createSdkMcpServer({ name, tools, alwaysLoad: true })` | Tools are already in MCP-compatible format; allowlist is shaped like `mcp__<server>__<tool>` |
| **OpenAI Agents** | `'openai-agents'` | `const tools = context.tools.all()` → pass to `new Agent({ tools })` | FunctionTool format |
| **OpenAI Chat/Responses** | `'openai-sdk'` | `const tools = context.tools.all()` | function descriptors; **distinct entry from openai-agents** |
| **LangGraph / DeepAgents / LangChain** | `'langgraph'` or `'deepagents'` | `const tools = context.tools.all()` → pass to `createAgent({ tools })` or `ToolNode(tools)` | LangChain `StructuredTool` instances |
| **CrewAI** | `'crewai'` | `const tools = context.tools.all()` | CrewAI BaseTool instances |

> ⚠️ The legal values of `agents.framework` are constrained by the Zod enum in `tef-cli/src/schema/config.ts`: `claude-sdk` / `openai-sdk` / `openai-agents` / `langgraph` / `crewai` / `deepagents`. **There is no `basic`** — `basic` is only the runtime fallback default inside `buildTools`; writing it into `edgeone.json` will be rejected by schema validation.

```typescript
// Claude SDK template pattern (recommended: use the official toClaudeMcpServer helper)
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'

// Option A (recommended): use toClaudeMcpServer directly — returns { name, tools, allowedTools }
const bundle = context.tools.toClaudeMcpServer('edgeone', { alwaysLoad: true })
query({ prompt, options: {
  mcpServers: { [bundle.name]: createSdkMcpServer(bundle) },
  allowedTools: bundle.allowedTools,   // shaped like mcp__edgeone__commands
} })

// Option B: use all() manually (works too, but you have to assemble allowedTools yourself)
const tools = context.tools.all()      // already MCP-compatible tools
const edgeoneMcp = createSdkMcpServer({ name: 'edgeone', tools, alwaysLoad: true })
```

### 2.3 Fetching a Single Tool / a Group on Demand

```typescript
// Fetch a single tool
const cmds = context.tools.get('commands')         // single tool or undefined
const search = context.tools.get('web_search')

// Fetch by group: files() / browser() are methods that return arrays
const fileTools = context.tools.files()            // file tools array
const browserTools = context.tools.browser()       // browser tools array

// Or filter all() yourself (e.g. expose only read-only file capabilities)
const safeTools = context.tools.all().filter(t =>
  ['files_read', 'files_list', 'files_exists'].includes(t.name)
)
```

> `files()` / `browser()` are callable methods on both Node and Python.

---

## 3. Built-in Tools Inventory

| Tool | Parameters | Notes |
|------|------|------|
| `commands` | cmd, cwd, env, timeout | One-shot shell; also used to download/generate binaries |
| `files_read` / `files_write` / `files_list` / `files_exists` / `files_remove` / `files_make_dir` | path (write also takes content) | Text-file CRUD; **use commands for binary** |
| `browser_fetch` / `browser_screenshot` / `browser_click` / `browser_type` / `browser_evaluate` | varies | Real Chromium |
| `code_interpreter` | language, code, timeout | Python/JS/R/Bash execution |
| `web_search` | query, maxResults, backend | Lightweight web search; does not depend on browser, spins up a one-shot runner inside the sandbox. ⚠️ **Requires the `WSA_API_KEY` environment variable** |

### ⭐ web_search Configuration Requirements

If a template uses `context.tools.web_search` (or pulls this tool via `context.tools.all()` / `get('web_search')`), `WSA_API_KEY` **must** be configured in the project environment variables.

| Item | Description |
|----|------|
| Env var name (EdgeOne Makers) | `WSA_API_KEY` |
| Upstream service | [Tencent Cloud Web Search API (product 1806)](https://cloud.tencent.com/document/product/1806/130615) — a standalone service, separate product from EdgeOne |
| Console | <https://console.cloud.tencent.com/wsapi/index> |
| Where to configure | EdgeOne project environment variables (same level as `AI_GATEWAY_API_KEY`) |
| How template code reads it | Usually **no explicit reference needed** — the sandbox runner reads `context.env.WSA_API_KEY` (or equivalent) directly and injects it into the search runner |
| Failure symptom | `web_search` calls fail with 401 / auth errors |

#### Steps to Obtain

1. Open the [Tencent Cloud Web Search API console](https://console.cloud.tencent.com/wsapi/index)
2. Overview page → "Service API KEY" section → click "Create API KEY"
3. Enter a key name → confirm → **download the CSV or copy immediately** (cannot be viewed again after closing the dialog)
4. Back in your EdgeOne project → environment variables → add `WSA_API_KEY` = the value you just copied
5. Redeploy; `context.tools.web_search` will now work

> ⚠️ Naming convention difference: in the Tencent Cloud Web Search API official docs, the env var is named `TENCENTCLOUD_WSA_APIKEY` (used when calling their SDK directly); in EdgeOne Makers' sandbox runner, **the convention is `WSA_API_KEY`**. Both point to the same key — only the injection location differs. Just set `WSA_API_KEY` in your EdgeOne project; you do not need to set `TENCENTCLOUD_WSA_APIKEY` separately.

**Template self-check:**
- If you only do plain LLM text generation (Route A, no search tool) → `WSA_API_KEY` is not needed
- If `agents/*.ts` contains `context.tools.get('web_search')` / `context.tools.all()` includes search → `WSA_API_KEY` **must** be configured
- If you take the Python path for `web_search` (the Python flavor of pages-agent-toolkit), you also need `primp/httpx/h2/lxml` installed in the sandbox python env (see below)

### web_search Runtime Dependencies (Python path only)

> **web_search runtime requirements**: the Node SDK requires node≥18 in the sandbox; the Python SDK requires python≥3.9 plus `primp>=1.2.3, httpx>=0.28.1, h2>=4.3.0, lxml>=5.0.0`. A `No module named 'primp'` error means a missing **sandbox** python dependency.
> Tool selection: open-ended public-web discovery → `web_search`; known URL needing DOM/screenshot/interaction → `browser_*`; explicit JSON/API endpoints → `commands` / `code_interpreter`.

---

## 4. Debug Logging

- **Off** by default; when enabled, logs are emitted to **stderr** and **do not enter the model context**.
- Enable with the env var `MAKERS_AGENT_TOOLKIT_DEBUG=1` (or in Python `build_tools(..., debug=True)`).
- Automatically redacts token/auth/password/secret/key; screenshots only print summaries, not full base64.

---

## 5. Review Red Lines

- [ ] Agent endpoints use `context.sandbox` / `context.tools` directly, with **no** hand-written `/v1/sandbox/*` calls or manual token parsing
- [ ] Template `.env` does **not** require sandbox tickets / PROJECT_ID / SANDBOX_API_BASE / API_ENV (unless connecting via SDK directly)
- [ ] `agents.framework` in `edgeone.json` is set correctly (`claude-sdk` / `openai-agents` / `openai-sdk` / `langgraph` / `deepagents` / `crewai` — **no `basic`**)
- [ ] Claude SDK templates prefer `context.tools.toClaudeMcpServer('edgeone', { alwaysLoad: true })` (recommended); manual assembly via `all()` is also acceptable
- [ ] `screenshot` is called with an object: `screenshot({ fullPage: true })`, not the boolean `screenshot(true)`
- [ ] `runCode` is invoked as the top-level `sandbox.runCode(...)`, **not** `sandbox.code_interpreter.runCode(...)` (that namespace does not exist)
- [ ] Binary / cached assets are generated inside the sandbox via `commands` (base64 -d), **not** misused through `files.write`
- [ ] The non-persistent nature of sandbox `/tmp/` is handled: the template wires up an in-process file cache plus re-upload on every request, and does not assume `/tmp/` is preserved
- [ ] System prompt explicitly forbids the AI from fabricating files when it sees `FileNotFoundError`
- [ ] Timeout values are in **seconds**, not mistakenly milliseconds
- [ ] `extendTimeout(seconds)` parameter is named `seconds`, not `s`
- [ ] For templates using `web_search` (Python), the sandbox python env already has primp/httpx/h2/lxml installed
- [ ] ⭐ Any template using the `web_search` tool (any language path) has `WSA_API_KEY` configured in project environment variables
