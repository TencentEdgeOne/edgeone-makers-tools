# Blob Storage

EdgeOne Pages Blob is distributed object storage for Pages Functions. Use it for images, documents, user uploads, generated files, JSON datasets, and other unstructured runtime data.

Important constraints:

- Blob currently provides a Node.js SDK: `@edgeone/pages-blob`.
- It is intended for runtime data read/write/query/processing inside Pages Functions.
- Do not treat Blob as a public image hosting service or CDN by default. If a browser or third-party app needs to access a Blob object, expose it through a Pages Function route that reads the object and returns the right `Content-Type`.
- Free tier storage is 1 GB per account.
- Console browsing is read-only. Namespace creation and data operations are done through the SDK.

## Consistency

Blob supports two read consistency modes:

- `eventual` default: fastest edge-cache read. Newly written data may take a short time, usually seconds, to appear globally.
- `strong`: bypasses cache and reads primary storage, ensuring the latest write is visible with higher latency.

Use strong consistency only when the request must read fresh data immediately after a write.

```js
const value = await store.get("counter", { consistency: "strong" });
```

You can also set the default consistency for a Store:

```js
const store = getStore({ name: "my-store", consistency: "strong" });
```

## Setup

Install the SDK:

```bash
npm install @edgeone/pages-blob
```

Use it in a Pages Function:

```js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest() {
  const store = getStore("my-store");

  await store.set("hello.txt", "Hello, EdgeOne Pages!");
  const content = await store.get("hello.txt");

  return new Response(content);
}
```

The first `getStore("my-store")` call creates the namespace automatically for the current project. After deployment, trigger the function once and the namespace/object appears in the console.

## Store Access

Inside Pages Functions, use only the namespace name:

```js
const store = getStore("my-store");
```

Outside Pages Functions, such as local scripts or external services, provide `projectId` and API token:

```js
const store = getStore({
  name: "my-store",
  projectId: "pages-urtsvuwmfvli",
  token: "your-api-token",
});
```

## API

### `store.set(key, value, options?)`

Writes an object. Existing keys are overwritten unless `onlyIfNew` is set.

Supported values: `string | ArrayBuffer | Blob | ReadableStream`.

```js
await store.set("photos/cat.jpg", imageBuffer);
await store.set("notes/todo.txt", "Buy milk");
await store.set("init.json", data, { onlyIfNew: true });
```

### `store.setJSON(key, value, options?)`

Serializes and writes JSON. Accepts the same options as `store.set`.

```js
await store.setJSON("user/preferences", { theme: "dark", lang: "zh-CN" });
```

### `store.get(key, options?)`

Reads an object. Returns `null` when the key does not exist.

`options.type`: `"text"` default, `"json"`, `"arrayBuffer"`, `"blob"`, or `"stream"`.

```js
const text = await store.get("hello.txt");
const json = await store.get("config.json", { type: "json" });
const buffer = await store.get("image.png", { type: "arrayBuffer" });
const blob = await store.get("video.mp4", { type: "blob" });
const stream = await store.get("large-file.zip", { type: "stream" });
```

### `store.getWithHeaders(key, options?)`

Reads object content plus response headers. Returns `null` when the key does not exist.

```js
const result = await store.getWithHeaders("document.pdf");
if (result) {
  return new Response(result.body, { headers: result.headers });
}
```

### `store.delete(key)`

Deletes an object. Missing keys do not throw.

```js
await store.delete("photos/cat.jpg");
```

### `store.list(options?)`

Lists objects. By default it aggregates all pages.

Common options:

- `prefix`: filter by key prefix.
- `directories`: group by `/` and return current-level files plus `directories`.
- `paginate: false`: return one page with `cursor`.
- `cursor`: continue manual pagination.
- `consistency`: `"eventual"` or `"strong"`.

```js
const { blobs } = await store.list();
const byPrefix = await store.list({ prefix: "photos/" });
const tree = await store.list({ prefix: "photos/", directories: true });
const fresh = await store.list({ consistency: "strong" });
const page1 = await store.list({ paginate: false });
const page2 = await store.list({ paginate: false, cursor: page1.cursor });
```

Return shape:

```ts
{
  blobs: Array<{ key: string; etag: string }>;
  directories?: string[];
  cursor?: string;
}
```

### `store.createUploadUrl(key, options?)`

Creates a presigned `PUT` URL so browsers or clients can upload directly to Blob without sending file bytes through Pages Functions.

```js
const { url, key, expiresAt } = await store.createUploadUrl(
  "files/photo.jpg",
  {
    expireSeconds: 3600,
    contentType: "image/webp",
  },
);
```

The generated URL is bound to:

- `PUT` method.
- The exact key.
- The expiry window.
- The exact `Content-Type`, when provided.

Any mismatch returns `403`.

### `listStores(options?)`

Lists namespaces in the current project.

```js
import { listStores } from "@edgeone/pages-blob";

const { stores } = await listStores();
```

Outside Pages Functions:

```js
const { stores } = await listStores({
  projectId: "pages-urtsvuwmfvli",
  token: "your-api-token",
});
```

## Patterns

### Browser Direct Upload

Function side:

```js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { name, contentType } = await request.json();
  const store = getStore("user-uploads");

  const upload = await store.createUploadUrl(`uploads/${Date.now()}-${name}`, {
    expireSeconds: 3600,
    contentType: contentType || "application/octet-stream",
  });

  return Response.json(upload);
}
```

Browser side:

```js
async function uploadFile(file) {
  const { url, key } = await fetch("/api/get-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, contentType: file.type }),
  }).then((response) => response.json());

  await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  return key;
}
```

### Serve a Blob File by URL

Blob objects do not automatically become public website assets. To make an uploaded object accessible by URL, create a function route that reads the object and returns it.

```js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ params }) {
  const store = getStore("user-uploads");
  const data = await store.get(`covers/${params.id}.webp`, {
    type: "arrayBuffer",
    consistency: "strong",
  });

  if (!data) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }

  return new Response(data, {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
```

### Directory Listing

```js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  const store = getStore("user-uploads");
  const url = new URL(request.url);
  const prefix = url.searchParams.get("path") || "";

  const { blobs, directories } = await store.list({
    prefix,
    directories: true,
  });

  return Response.json({ files: blobs, folders: directories });
}
```

### Conditional Write

```js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest() {
  const store = getStore("configs");

  await store.setJSON("app/settings", { version: 1 }, { onlyIfNew: true });
  const settings = await store.get("app/settings", { type: "json" });

  return Response.json(settings);
}
```

## Practical Notes

- Use `createUploadUrl` for large files, user uploads, and browser uploads.
- When `contentType` is set on `createUploadUrl`, the browser `PUT` request must send the exact same `Content-Type`.
- Use `arrayBuffer` for binary files and return a `Response` with the correct `Content-Type`.
- Use `strong` reads immediately after uploads when previewing or verifying a just-written object.
- Organize keys by business entity, for example `books/{bookId}/cover.webp` or `uploads/{userId}/{fileName}`.
