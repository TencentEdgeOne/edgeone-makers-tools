# Blob Storage

## Contents

- [Quick Start](#quick-start)
- [Blob as your backend (there is no database)](#blob-as-your-backend-there-is-no-database)
- [Consistency Model](#consistency-model)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Limits](#limits)
- [Common Errors](#common-errors)
- [Best Practices](#best-practices)

EdgeOne Makers Blob is a distributed **object storage** service for Makers Functions. Suitable for storing images, documents, user uploads, AI-generated content, and structured data sets.

> ⚠️ Blob is for **Makers Functions (Cloud Functions)** — uses the `@edgeone/pages-blob` npm SDK (NOT a global variable like KV).

> 🔒 **IRON RULE — Always use `consistency: "strong"`. No exceptions, no "just this once".**
> Create **every** store as `getStore({ name: "X", consistency: "strong" })`. This makes every `get` / `list` on that instance read from primary storage, so a write is visible to the very next read — no "I just posted / liked / saved but it didn't show up" delay.
> Eventual consistency is the **#1 cause of "data didn't update" bugs** in generated apps (stale reads, likes that don't appear, posts missing from a freshly reloaded wall). Do **not** rely on the default `eventual` mode for any read-write path. A per-call `{ consistency: "strong" }` also works, but setting it once on `getStore` is the only way you can't forget it. (Strong adds a little read latency — always worth it for correctness.)

## Quick Start

### 1. Install SDK

```bash
npm install @edgeone/pages-blob@^0.0.14
```

> ⚠️ Version requirement: ≥ 0.0.14 (older versions have known bugs).

### 2. Basic Usage

```javascript
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  const store = getStore({ name: "my-store", consistency: "strong" });

  // Write
  await store.set("hello.txt", "Hello, EdgeOne Makers!");

  // Read
  const content = await store.get("hello.txt");

  return new Response(content);
}
```

First call to `getStore("my-store")` auto-creates the namespace. No console setup required.

---

## Blob as your backend (there is no database)

This platform has **no managed database**. When a site needs to persist dynamic data — messages, votes, uploads, leaderboards, per-user save state — model it on Blob. **Do not** use `sqlite`/`pg`/`mongodb` or an in-memory array (arrays reset on cold start / redeploy).

Blob is a **key → value** store. You design a **key naming scheme**; that scheme *is* your schema. Two modeling styles — pick per data shape:

| Style | Layout | Read pattern | Use when |
|-------|--------|-------------|----------|
| **One file per record** (default) | `messages/<id>.json` | `list({ prefix })` then `get` each, or list keys for feeds | Data **grows** or is written **concurrently** (guestbook, gallery, submissions, feeds) |
| **Single JSON document** | `poll.json` holds one array/object | one `get` / `setJSON` | Data is **small & bounded** and rarely written concurrently (a poll's options, one config blob) |

> ⚠️ **Concurrency rule:** a single JSON document is read-modify-write — two visitors writing at once overwrite each other. Anything many users append to (messages, uploads, votes-as-rows) → **one file per record**. Reserve the single-document style for small, low-contention data.

Generate a collision-free id without `Date.now()`/`Math.random()` pitfalls by combining a timestamp with a short random suffix, or use the caller-supplied key (e.g. `users/<uid>.json`).

### Pattern 1 — Collection / feed (guestbook, gallery, story relay, wish wall)

One file per entry under a prefix. List (newest first via a sortable key), then read each.

```javascript
// cloud-functions/api/messages.js  →  GET lists, POST appends
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  const store = getStore({ name: "guestbook", consistency: "strong" });

  if (request.method === "POST") {
    const { name, text } = await request.json();
    const ts = Date.now();                          // ok at runtime; forbidden only in Workflow scripts
    const id = `${ts}-${Math.round(Math.random() * 1e6)}`;
    // Zero-padded/inverted key so lexical list order == newest first is also possible;
    // here we just sort after listing.
    await store.setJSON(`entries/${id}.json`, { id, name, text, ts });
    return Response.json({ ok: true, id });
  }

  // GET: list all entries, newest first
  const { blobs } = await store.list({ prefix: "entries/" });
  const items = await Promise.all(
    blobs.map((b) => store.get(b.key, { type: "json" }))
  );
  items.sort((a, b) => b.ts - a.ts);
  return Response.json({ items });
}
```

> For large collections, list returns keys cheaply; only `get` the page you render. For "delete this message" (teacher moderation), call `store.delete("entries/<id>.json")`.

### Pattern 2 — Per-user / per-key record (growth portfolio, pet save state, reading check-in)

The key is the identity. One `get` to load, one `setJSON` to save.

```javascript
// cloud-functions/api/pet.js  →  load & save one kid's pet
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  const store = getStore({ name: "pets", consistency: "strong" });
  const uid = new URL(request.url).searchParams.get("uid");   // or from auth/middleware

  if (request.method === "POST") {
    const state = await request.json();          // { hunger, happiness, lastFed }
    await store.setJSON(`users/${uid}.json`, state);
    return Response.json({ ok: true });
  }

  const state = (await store.get(`users/${uid}.json`, { type: "json" })) ?? {
    hunger: 100, happiness: 100, lastFed: null,   // defaults for a brand-new pet
  };
  return Response.json(state);
}
```

### Pattern 3 — Counter / vote / like / leaderboard (⚠️ use strong consistency)

Read-modify-write **must** read with `{ consistency: "strong" }`, or concurrent votes read stale and clobber each other.

```javascript
// cloud-functions/api/vote.js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  const store = getStore({ name: "votes", consistency: "strong" });
  const { option } = await request.json();       // e.g. "act-3"

  // one counter file per option → votes/act-3.json
  const key = `counts/${option}.json`;
  const cur = (await store.get(key, { type: "json", consistency: "strong" })) ?? { n: 0 };
  cur.n += 1;
  await store.setJSON(key, cur);

  // leaderboard = list all counters, sort desc
  const { blobs } = await store.list({ prefix: "counts/" });
  const board = await Promise.all(
    blobs.map(async (b) => {
      const { n } = await store.get(b.key, { type: "json", consistency: "strong" });
      return { option: b.key.replace(/^counts\/|\.json$/g, ""), n };
    })
  );
  board.sort((a, b) => b.n - a.n);
  return Response.json({ board });
}
```

> Even strong-consistency read-modify-write has a tiny race window under heavy concurrency. For a class of ~30 kids clicking occasionally this is fine; do **not** build a bank ledger on it. Keep each counter in its **own** key so different options don't contend.

### Pattern 4 — File upload + status flow (drawings, photos, lost-and-found, library loans)

Store the **file bytes** as one blob and a **metadata JSON** as another, linked by a shared id. Use `createUploadUrl` for direct browser upload (see the full example under "Examples" below), then flip a status field later.

```javascript
// after the client PUTs the image to the pre-signed URL, register metadata:
const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
await store.setJSON(`items/${id}.json`, {
  id,
  fileKey: `uploads/${id}.jpg`,   // where the bytes live
  title,
  status: "open",                 // later: store.setJSON(... status: "claimed")
  likes: 0,
});
```

**Cheat sheet — map the ask to a pattern:**

| The generated site needs to… | Pattern | Key scheme |
|------------------------------|---------|-----------|
| Post & list messages / drawings / stories | 1 (collection) | `entries/<id>.json` |
| Save each kid's progress / pet / diary | 2 (per-user) | `users/<uid>.json` |
| Count votes / likes / high scores + rank | 3 (counter, **strong**) | `counts/<option>.json` |
| Upload a file then change its status | 4 (file + meta) | `uploads/<id>.jpg` + `items/<id>.json` |

---

## Consistency Model

> 🔒 **Default to STRONG, always.** Set it on `getStore` and you never have to remember per-call options. Eventual is opt-in only, and almost never needed.

| Mode | Behavior | When to use |
|------|----------|-------------|
| **Strong** (**default — always on**) | Reads from primary storage; a write is immediately visible to the next read | **Every** read-write path: posts, likes, votes, saves, counters, lists, status flips |
| **Eventual** (opt-in only) | Edge-cached, fastest; new writes may take seconds to propagate | Rare pure-display caching where a few seconds of staleness is truly acceptable — and even then, prefer strong unless you measured a problem |

```javascript
// ✅ Canonical: strong by default on the whole store (recommended — can't forget it)
const store = getStore({ name: "my-store", consistency: "strong" });
const value = await store.get("key");                  // strong, no per-call flag needed
const { blobs } = await store.list({ prefix: "x/" });  // strong

// ✅ Also valid: per-call strong on a default (eventual) store
const fresh = await store.get("counter", { consistency: "strong" });

// ❌ Wrong: default eventual store — writes won't be visible to the next read
const store = getStore("my-store");
```

---

## API Reference

```javascript
import { getStore, listStores } from "@edgeone/pages-blob";
```

### getStore(name | options)

Get a Store instance.

**In Makers Functions:**
```javascript
const store = getStore("my-store");
const store = getStore({ name: "my-store", consistency: "strong" });
```

**Outside Makers Functions** (local scripts, external services):
```javascript
const store = getStore({
  name: "my-store",
  projectId: "makers-urtsvuwmfvli",
  token: "your-api-token",
});
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Namespace name |
| `projectId` | `string` | Outside Functions | Project ID |
| `token` | `string` | Outside Functions | API Token |
| `consistency` | `"eventual" \| "strong"` | No | **Pass `"strong"` always.** (SDK default is `eventual`, but per the IRON RULE you must override it.) |

---

### store.set(key, value, options?)

Write an object. Overwrites if key exists.

```javascript
await store.set("photos/cat.jpg", imageBuffer);
await store.set("notes/todo.txt", "Buy milk");

// Only write if key doesn't exist
await store.set("init.json", data, { onlyIfNew: true });
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Object key |
| `value` | `string \| ArrayBuffer \| Blob \| ReadableStream` | Yes | Content |
| `options.onlyIfNew` | `boolean` | No | Only write if key doesn't exist |

Returns: `Promise<void>`

---

### store.setJSON(key, value, options?)

Write JSON (auto-serialized). Same options as `set`.

```javascript
await store.setJSON("user/preferences", { theme: "dark", lang: "zh-CN" });
```

---

### store.get(key, options?)

Read an object. Returns `null` if key doesn't exist.

```javascript
const text = await store.get("hello.txt");
const json = await store.get("config.json", { type: "json" });
const buffer = await store.get("image.png", { type: "arrayBuffer" });
const blob = await store.get("video.mp4", { type: "blob" });
const stream = await store.get("large-file.zip", { type: "stream" });

// Strong consistency
const fresh = await store.get("counter", { consistency: "strong" });
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Object key |
| `options.type` | `"text" \| "json" \| "arrayBuffer" \| "blob" \| "stream"` | No | Return type (default `"text"`) |
| `options.consistency` | `"eventual" \| "strong"` | No | Read consistency |

Returns: `Promise<string | object | ArrayBuffer | Blob | ReadableStream | null>`

---

### store.getWithHeaders(key, options?)

Read object content plus response headers. Returns `null` if key doesn't exist.

```javascript
const result = await store.getWithHeaders("document.pdf");
// result.body — content
// result.headers — { "content-type": "...", "etag": "...", ... }
```

Returns: `Promise<{ body: string; headers: Record<string, string> } | null>`

---

### store.delete(key)

Delete an object. No error if key doesn't exist.

```javascript
await store.delete("photos/cat.jpg");
```

---

### store.list(options?)

List objects in the namespace. Auto-paginates by default.

```javascript
// List all
const { blobs } = await store.list();

// Filter by prefix
const { blobs } = await store.list({ prefix: "photos/" });

// Directory grouping (current level files + subdirectories)
const { blobs, directories } = await store.list({
  prefix: "photos/",
  directories: true,
});

// Strong consistency
const { blobs } = await store.list({ consistency: "strong" });

// Manual pagination
const page1 = await store.list({ paginate: false });
const page2 = await store.list({ paginate: false, cursor: page1.cursor });
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `options.prefix` | `string` | No | Filter by key prefix |
| `options.directories` | `boolean` | No | Group by `/`, return `directories` field |
| `options.paginate` | `boolean` | No | `false` = single page with cursor |
| `options.cursor` | `string` | No | Continue from previous page |
| `options.consistency` | `"eventual" \| "strong"` | No | Read consistency |

Returns:
```typescript
{
  blobs: Array<{ key: string; etag: string }>;
  directories?: string[];  // only when directories: true
  cursor?: string;         // only when paginate: false
}
```

---

### store.createUploadUrl(key, options?)

Generate a pre-signed PUT URL for client-side direct upload. File data bypasses the function — client uploads directly to Blob.

```javascript
const { url, key, expiresAt } = await store.createUploadUrl("files/photo.jpg", {
  expireSeconds: 3600,
  contentType: "image/jpeg",
});
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Object key after upload |
| `options.expireSeconds` | `number` | No | URL validity (seconds), default 3600 |
| `options.contentType` | `string` | No | If set, client must send matching Content-Type |

Returns:
```typescript
{
  url: string;        // Pre-signed URL
  key: string;        // Object key
  expiresAt: number;  // Expiry (Unix timestamp, seconds)
}
```

---

### listStores(options?)

List all namespaces in the current project.

```javascript
import { listStores } from "@edgeone/pages-blob";

// In Makers Functions
const { stores } = await listStores();

// External access
const { stores } = await listStores({
  projectId: "makers-urtsvuwmfvli",
  token: "your-api-token",
});
```

---

## Examples

### Client Direct Upload (Pre-signed URL)

**Function (sign the URL):**
```javascript
// cloud-functions/api/get-upload-url.js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { name, contentType } = await request.json();
  const store = getStore("user-uploads");

  const { url, key, expiresAt } = await store.createUploadUrl(
    `uploads/${Date.now()}-${name}`,
    {
      expireSeconds: 3600,
      contentType: contentType || "application/octet-stream",
    }
  );

  return new Response(JSON.stringify({ url, key, expiresAt }), {
    headers: { "Content-Type": "application/json" },
  });
}
```

**Browser (upload directly):**
```javascript
async function uploadFile(file) {
  // 1. Request upload URL from function
  const { url, key } = await fetch("/api/get-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, contentType: file.type }),
  }).then((r) => r.json());

  // 2. Upload directly to Blob
  await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  return key;
}
```

### List Files by Directory

```javascript
// cloud-functions/api/files.js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  const store = getStore("user-uploads");
  const url = new URL(request.url);
  const prefix = url.searchParams.get("path") || "";

  const { blobs, directories } = await store.list({
    prefix,
    directories: true,
  });

  return new Response(
    JSON.stringify({ files: blobs, folders: directories }),
    { headers: { "Content-Type": "application/json" } }
  );
}
```

### Conditional Write (Prevent Overwrite)

```javascript
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  const store = getStore("configs");

  // Only write if key doesn't exist
  await store.setJSON("app/settings", { version: 1 }, { onlyIfNew: true });

  const settings = await store.get("app/settings", { type: "json" });
  return new Response(JSON.stringify(settings), {
    headers: { "Content-Type": "application/json" },
  });
}
```

---

## Limits

| Resource | Limit |
|----------|-------|
| Storage per account (free tier) | 1 GB |
| SDK | `@edgeone/pages-blob` (Node.js only, other runtimes coming) |
| Supported runtime | Makers Functions (Cloud Functions) |
| Consistency | Strong (recommended default) or Eventual (opt-in only) |

---

## Common Errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module '@edgeone/pages-blob'` | SDK not installed | Run `npm install @edgeone/pages-blob@^0.0.14` |
| `get()` returns stale data / write not visible to the next read | Used default (eventual) consistency | Create the store with `getStore({ name, consistency: "strong" })` so **all** reads are strong |
| Upload URL returns 403 | Content-Type mismatch or URL expired | Ensure client sends matching Content-Type header; check expiry |
| Trying to use Blob in Edge Functions | Blob only works in Cloud Functions | Move code to `cloud-functions/` directory |

---

## Best Practices

1. **Use key prefixes** to organize: `uploads/`, `photos/`, `reports/`
2. **Use `createUploadUrl`** for large files — avoid routing file bytes through your function
3. **Always use strong consistency** — create every store with `getStore({ name, consistency: "strong" })`; only fall back to eventual for measured pure-display caching (rare)
4. **Use `setJSON`/`get({ type: "json" })`** for structured data instead of manual `JSON.stringify/parse`
5. **Use `directories: true`** in `list()` for folder-like browsing UIs
