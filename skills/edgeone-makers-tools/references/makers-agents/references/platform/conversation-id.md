# Conversation ID + Frontend Convention

## Contents

- [Principle](#principle)
- [⭐ Conversation ID and the `makers-conversation-id` Header (Iron Rule)](#conversation-id-and-the-makers-conversation-id-header-iron-rule)
- [⭐ Request body for `/chat` (the shape the preview probe sends)](#request-body-for-chat-the-shape-the-preview-probe-sends)
- [Endpoint → Frontend Call Style Cheat Sheet](#endpoint-frontend-call-style-cheat-sheet)
- [i18n](#i18n)

> Covers: makers-conversation-id dual-channel contract, /stop inverted rule, frontend call patterns, endpoint cheat sheet.

---
## Frontend Convention

### Principle
- The frontend framework is not prescribed — use Next.js, Vite, React, Vue, plain HTML, or any framework
- Frontend calls agent endpoints via `fetch('/<action>', { method:'POST', body })`, then reads SSE with `EventSource` / `ReadableStream`

### ⭐ Conversation ID and the `makers-conversation-id` Header (Iron Rule)

**Every fetch to an AI endpoint must carry the `makers-conversation-id` HTTP header** — that means `/chat`, `/outline`, `/create`, `/create-lite`, every endpoint under `agents/`. Otherwise:
- The backend's `context.conversation_id` will be empty
- The session adapters (`openaiSession` / `claudeSessionStore`) cannot resume history
- Sticky routing breaks — each request may land on a different agent instance
- `/stop` cannot find the running run, and abort silently fails

**Generate + persist pattern (recommended on the frontend)**:
```typescript
// Frontend conversation ID helper
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
// Frontend code example
const conversationId = getOrCreateConversationId();

const resp = await fetch('/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'makers-conversation-id': conversationId,   // ⭐ required
  },
  body: JSON.stringify({ messages, files }),
});
```

### ⭐ Request body for `/chat` (the shape the preview probe sends)

`messages` is `{ role: 'user' | 'assistant', content: string }[]`, oldest first,
and it is the **only** body a chat UI sends — a one-element array on the first
turn, not a bare string.

```typescript
body: JSON.stringify({
  messages: [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，有什么可以帮你的？' },
    { role: 'user', content: '介绍一下 EdgeOne' },
  ],
})
```

**Read `messages` and nothing else.** Accepting a singular `message` as well
gives the handler two shapes to keep straight, and the preview probe sends only
this one — a mistake in the other branch reaches production unseen.

**Never write `body.messages ?? body.message ? [...] : []`.** `??` binds tighter
than `?:`, so it reads as `(body.messages ?? body.message) ? ... : ...`: the
array decides the branch and is then thrown away, and the content is taken from
a `message` that no client sent. It compiles, it type-checks, `npm run build`
is clean, and every request is answered 400.

Where the history lives is the choice this shape settles:

| History held by | How | Use when |
|---|---|---|
| The client | the `messages` array above | a plain chat UI — nothing else to configure |
| The platform | `context.store.openaiSession()` / `claudeSessionStore`, keyed by `makers-conversation-id` | an SDK route resumes the conversation and the frontend sends only the new turn |

Single-shot endpoints that take one prompt and are finished (`/outline`,
`/create`) keep the singular `{ message, files }` — they carry no conversation.

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

