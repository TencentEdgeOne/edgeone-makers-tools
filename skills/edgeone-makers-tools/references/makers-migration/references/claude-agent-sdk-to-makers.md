# Migration: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) → EdgeOne Makers

Claude Agent SDK runs a Claude Code subprocess, so the biggest differences are: (1) route the model through AI Gateway by mapping `AI_GATEWAY_*` → `ANTHROPIC_*`, (2) provide a writable config/temp dir, (3) wire platform tools via `toClaudeMcpServer`, and (4) bind session memory through `claudeSessionStore`.

---

## Node

### ❌ Before — native Claude Agent SDK (Express + ANTHROPIC_API_KEY)

```typescript
// server.ts
import express from 'express';
import { query, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const app = express();
app.use(express.json());

// Custom MCP server with hand-written tools
const customMcp = createSdkMcpServer({
  name: 'custom-tools',
  tools: [{
    name: 'get_weather',
    description: 'Get weather',
    inputSchema: { city: z.string() },
    handler: async ({ city }) => ({ content: [{ type: 'text', text: `Weather in ${city}` }] }),
  }],
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;
  const stream = query({
    prompt: message,
    options: {
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },  // ⚠️ direct Anthropic
      maxTurns: 30,
      mcpServers: { 'custom-tools': customMcp },
    },
  });
  res.setHeader('Content-Type', 'text/event-stream');
  for await (const msg of stream) {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);   // raw SDK messages
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(3000);
```

### ✅ After — Makers agent handler

```typescript
// agents/chat/index.ts
import { query, createSdkMcpServer, getSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createSSEResponse, sseEvent } from '../_shared';
import { resolveModelName, collectGatewayEnv } from '../_model';  // see platform/node-entry.md §3

const sseQueue: string[] = [];   // side channel for custom-tool events

export async function onRequest(context: any) {
  const ctxEnv = context.env ?? {};
  const body = context.request.body ?? {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return new Response(JSON.stringify({ error: "'message' is required" }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });

  const signal = context.request.signal;
  const conversationId = context.conversation_id;
  const store = context.store ?? null;

  // ⭐ Platform tools via toClaudeMcpServer → createSdkMcpServer
  const edgeoneBundle = context.tools.toClaudeMcpServer('edgeone', { alwaysLoad: true });
  const edgeoneMcpServer = createSdkMcpServer(edgeoneBundle);

  // Optional custom tools push events into sseQueue
  const customMcpServer = createSdkMcpServer({
    name: 'custom-tools',
    alwaysLoad: true,
    tools: [{
      name: 'get_weather',
      description: 'Get weather',
      inputSchema: { city: z.string() },
      handler: async ({ city }) => {
        sseQueue.push(sseEvent({ type: 'tool_result', name: 'get_weather', content: `Weather in ${city}` }));
        return { content: [{ type: 'text', text: `Weather in ${city}` }] };
      },
    }],
  });

  async function* run(sig?: AbortSignal): AsyncGenerator<string> {
    // ⭐ Session binding (resume vs new)
    let sessionBinding: any = {};
    if (store && conversationId) {
      try {
        const info = await getSessionInfo(conversationId, { dir: process.cwd(), sessionStore: store.claudeSessionStore() });
        if (info) sessionBinding = { resume: conversationId };
      } catch { sessionBinding = { sessionId: conversationId }; }
    }

    const stream = query({
      prompt: message,
      options: {
        model: resolveModelName(ctxEnv),
        env: {
          ...collectGatewayEnv(ctxEnv),                 // ⭐ AI_GATEWAY_* → ANTHROPIC_*
          CLAUDE_CONFIG_DIR: '/tmp/claude-agent-sdk',   // ⭐ writable config dir (required)
          CLAUDE_CODE_TMPDIR: '/tmp',                   // ⭐ writable temp dir (required)
        },
        maxTurns: 30,
        mcpServers: { edgeone: edgeoneMcpServer, 'custom-tools': customMcpServer },
        allowedTools: edgeoneBundle.allowedTools,
        ...sessionBinding,
        abortController: sig ? { signal: sig } as any : undefined,
      },
    });

    for await (const msg of stream) {
      if (sig?.aborted) break;
      while (sseQueue.length) yield sseQueue.shift()!;   // drain custom-tool events
      // dispatch msg.type → ai_response / tool_call / file_output ...
    }
    while (sseQueue.length) yield sseQueue.shift()!;
    yield 'data: [DONE]\n\n';
  }

  return createSSEResponse(run, signal);
}
```

`edgeone.json`:
```json
{ "agents": { "framework": "claude-agent-sdk" } }
```

> `@anthropic-ai/claude-agent-sdk` is auto-externalized — no `externalNodeModules` needed.

### Required differences vs native

1. **EPIPE guard** — add once at module load:
   ```typescript
   process.stdout.on('error', (err: any) => { if (err.code === 'EPIPE') return; });
   ```
2. **Writable config/temp dirs** — the SDK subprocess needs writable `~/.claude` and temp; set `CLAUDE_CONFIG_DIR='/tmp/claude-agent-sdk'` and `CLAUDE_CODE_TMPDIR='/tmp'` in `options.env`.
3. **No `process.env`** — agent endpoints disable `process.env`; always use `context.env`.
4. **Tools** — `context.tools.toClaudeMcpServer('edgeone', { alwaysLoad: true })` returns `{ name, tools, allowedTools }`; pass the created server as `edgeone` and set `allowedTools`.
5. **Sandbox** — if you use `context.sandbox`, its `/tmp` is per-request and easily lost; keep a process-level file cache and re-upload every request. See [makers-agents capabilities/sandbox.md](../../makers-agents/references/capabilities/sandbox.md).

---

## Python equivalent

Native `claude_agent_sdk` (Python) uses `query()` / `ClaudeAgentOptions`. On Makers:

- Entry `async def handler(ctx):`
- `ctx.env` → `collect_gateway_env()` → inject into `ClaudeAgentOptions(env=...)`
- `ctx.tools.to_claude_mcp_server('edgeone', always_load=True)` → `create_sdk_mcp_server(bundle)`
- Set `CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_TMPDIR` in env
- Session via `ctx.store.claude_session_store()`
- Stream via `ctx.utils.stream_sse(gen())`
- `buildCommand: ""`, `outputDirectory: ""`

See [makers-agents python-frameworks/claude-sdk.md](../../makers-agents/references/python-frameworks/claude-sdk.md).

---

## Conversion Checklist

| Native Claude Agent SDK | Makers |
|-------------------------|--------|
| `env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }` | `env: { ...collectGatewayEnv(context.env), CLAUDE_CONFIG_DIR, CLAUDE_CODE_TMPDIR }` |
| `mcpServers: { custom }` only | Add `edgeone: createSdkMcpServer(context.tools.toClaudeMcpServer(...))` |
| No EPIPE guard | `process.stdout.on('error', ...)` swallow EPIPE |
| No config dir handling | Set `CLAUDE_CONFIG_DIR='/tmp/claude-agent-sdk'`, `CLAUDE_CODE_TMPDIR='/tmp'` |
| Local filesystem session | `context.store.claudeSessionStore()` + `getSessionInfo` resume/new |
| `app.post('/chat', ...)` + raw SDK messages | `export async function onRequest(context)` + `createSSEResponse(gen, signal)` + `sseQueue` side channel |
| `process.env.X` | `context.env.X` |
