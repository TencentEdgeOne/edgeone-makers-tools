# Migration: Generic API Route → EdgeOne Makers (no-framework path)

> This is the **framework-less fallback**. Use it when your project does **not** use any of the five
> agent frameworks (LangGraph, DeepAgents, OpenAI Agents SDK, Claude Agent SDK, CrewAI) — e.g. a custom
> agent loop wrapped in Express, a Next.js API route, or a plain HTTP endpoint.

EdgeOne Makers supports running an agent **without any agent framework**: you just export
`onRequest(context)` (Node) or `async def handler(ctx):` (Python) and the runtime routes
`agents/<name>/` → `POST /<name>`. This file covers converting a generic HTTP server (Express /
Next.js / Flask / FastAPI) into that form.

For framework-specific migrations, see the sibling files:
`langgraph-to-makers.md`, `deepagents-to-makers.md`, `openai-agents-to-makers.md`,
`claude-agent-sdk-to-makers.md`, `crewai-to-makers.md`.

---

## Example 1: Next.js API Route (app router)

### ❌ Before

```typescript
// app/api/chat/route.ts
import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: message }],
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

### ✅ After

```typescript
// agents/chat/index.ts
import { createSSEResponse } from '../_shared';

export async function onRequest(context: any) {
  const { message } = context.request.body ?? {};
  if (!message) return new Response('Missing message', { status: 400 });

  const signal = context.request.signal as AbortSignal;
  const env = context.env;

  return createSSEResponse(async function* (sig) {
    const response = await fetch(env.AI_GATEWAY_BASE_URL + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.AI_GATEWAY_MODEL || '@makers/deepseek-v4-flash',
        messages: [{ role: 'user', content: message }],
        stream: true,
      }),
      signal: sig,
    });

    const reader = (response.body as ReadableStream).getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const text = parsed.choices?.[0]?.delta?.content || '';
          if (text) yield sseEvent({ type: 'ai_response', content: text });
        } catch { /* skip */ }
      }
    }
    yield 'data: [DONE]\n\n';
  }, signal);
}
```

---

## Example 2: Express Router

### ❌ Before

```typescript
// server/routes/agent.ts
import express from 'express';
const router = express.Router();

router.post('/summarize', async (req, res) => {
  const { text } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  const completion = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Summarize: ${text}` }],
    }),
  });

  const data = await completion.json();
  res.json({ summary: data.choices[0].message.content });
});

export default router;
```

### ✅ After

```typescript
// agents/summarize/index.ts
export async function onRequest(context: any) {
  const { text } = context.request.body ?? {};
  if (!text) return new Response('Missing text', { status: 400 });

  const env = context.env;
  const completion = await fetch(env.AI_GATEWAY_BASE_URL + '/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_GATEWAY_MODEL || '@makers/deepseek-v4-flash',
      messages: [{ role: 'user', content: `Summarize: ${text}` }],
    }),
  });

  const data = await completion.json();
  return new Response(JSON.stringify({
    summary: data.choices?.[0]?.message?.content ?? '',
  }), { headers: { 'Content-Type': 'application/json' } });
}
```

---

## Conversion Checklist

| Express/Next.js | Makers |
|-----------------|--------|
| `export async function POST(req)` | `export async function onRequest(context)` |
| `await req.json()` | `context.request.body` |
| `req.headers.get('x')` | `context.request.headers['x']` |
| `res.json(data)` | `new Response(JSON.stringify(data), { headers: {...} })` |
| `process.env.X` | `context.env.X` |
| `app.post('/summarize', ...)` | `agents/summarize/index.ts` (auto-routed) |
| `router.get('/api/x')` | `agents/x/index.ts` (path = `/x`) |
| Streaming via `ReadableStream` | `createSSEResponse(gen, signal)` |

> No `edgeone.json` `agents.framework` is required for the no-framework path — the runtime serves
> `onRequest` / `handler` directly. Set `agents.framework` only when you use one of the five agent
> frameworks (and `buildCommand`/`outputDirectory` for a frontend build as needed).
