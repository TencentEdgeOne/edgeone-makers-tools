# SSE Streaming Protocol Convention

## Contents

- [Principle](#principle)
- [Unified Event Type Table](#unified-event-type-table)
- [Reusable SSE Helper](#reusable-sse-helper-place-in-agents_sharedts--multimodal-version-recommended)
- [⭐ Reading the stream on the frontend](#reading-the-stream-on-the-frontend)
- [⛔ A failed turn must not leave its user message in the posted history](#a-failed-turn-must-not-leave-its-user-message-in-the-posted-history)

> Covers: unified event types, heartbeat, response headers, reusable `createSSEResponse` helper, the frontend reader contract.

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

### ⭐ Reading the stream on the frontend

`[DONE]` is the only thing separating a turn that finished from a turn that was
cut off, so **the reader must record whether it arrived** and the UI must branch
on it. A reader that leaves its loop on `done` and then looks only at how much
text it collected cannot tell the two apart, and reports a dropped turn as an
empty answer.

```javascript
let sawDone = false;
const reader = resp.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (!sawDone) {
  const { done, value } = await reader.read();
  if (done) break;                       // closed early — sawDone is still false
  buffer += decoder.decode(value, { stream: true });

  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') { sawDone = true; break; }
    if (payload) handleEvent(JSON.parse(payload));
  }
}

if (!sawDone && !aborted) {
  // A truncated stream. Say so, and offer a retry — do not fall through to
  // whatever the UI says when a turn legitimately produced no text.
  showRetry('连接中断，请重试');
}
```

The window this protects is widest on the first request an endpoint serves: a
cold agent instance can take ten seconds or more to reach its first token, which
is what the heartbeat is for, and is also long enough for anything between the
two ends to give up.

### ⛔ A failed turn must not leave its user message in the posted history

The `messages` array sent to `/chat` must end with exactly one `user` message and
**must never contain two consecutive `user` messages**. When a turn produces no
assistant reply, its user message has to come back out of the history that gets
posted — keep it on screen marked as failed if you like, but do not post it again
behind the next question.

Leaving it in is a bug that outlives the turn that caused it. The model receives
two questions in a row and answers both in one reply, and every later turn
carries the same doubled history. The user does not see a network error; they see
an assistant answering something they asked several turns ago. One dropped turn
then reads as a broken conversation rather than as a retry.

---
