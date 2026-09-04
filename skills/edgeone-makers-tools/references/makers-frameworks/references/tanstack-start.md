# TanStack Start

## Contents

- [The adapter](#the-adapter)
- [Scaffold](#scaffold)
- [Preview asset prefix](#preview-asset-prefix)
- [Build settings](#build-settings)
- [Server functions](#server-functions)
- [API routes](#api-routes)
- [Streaming](#streaming)
- [404 page](#404-page)
- [Feature support](#feature-support)

TanStack Start 1.132+ is supported. EdgeOne CLI must be 1.2.0 or newer.

## The adapter

**Always required.** TanStack Start needs a deployment target to emit a server bundle.

```bash
npm install @edgeone/tanstack-start
```

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { edgeoneAdapter } from "@edgeone/tanstack-start";

export default defineConfig({
  plugins: [
    tanstackStart(),
    edgeoneAdapter(),
  ],
});
```

The adapter and a Nitro plugin cannot coexist — an official Nitro preset is not published,
so remove `@tanstack/start-plugin-nitro` and any `nitroPlugin` / `nitroV2Plugin` call
rather than trying to configure both.

## Scaffold

```bash
npx create-tsrouter-app@latest . --template file-router --framework react --tailwind --no-git
```

## Preview asset prefix

A Vite project, so `base`:

```typescript
export default defineConfig({
  base: process.env.EDGEONE_PREVIEW_ASSET_PREFIX,
  plugins: [tanstackStart(), edgeoneAdapter()],
});
```

## Build settings

- Build command: `npm run build`
- Output directory: whatever the adapter writes; leave `outputDirectory` out of
  `edgeone.json` for a TanStack Start project.

## Server functions

`createServerFn` is the framework's server boundary and it works here. Everything inside
the handler runs on the server only, so secrets stay out of the client bundle:

```typescript
import { createServerFn } from "@tanstack/react-start";

export const getPosts = createServerFn({ method: "GET" }).handler(async () => {
  const res = await fetch("https://api.example.com/posts", {
    headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
  });
  return res.json();
});
```

Call it from a route loader:

```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/posts")({
  loader: () => getPosts(),
  component: Posts,
});

function Posts() {
  const posts = Route.useLoaderData();
  return <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

## API routes

Server routes live alongside page routes:

```typescript
// src/routes/api/hello.ts
import { createServerFileRoute } from "@tanstack/react-start/server";

export const ServerRoute = createServerFileRoute("/api/hello").methods({
  GET: async () => Response.json({ message: "hello" }),
});
```

## Streaming

Return a promise from the loader and resolve it with `Await`:

```typescript
export const Route = createFileRoute("/dashboard")({
  loader: () => ({ slow: getSlowData() }),
  component: Dashboard,
});

function Dashboard() {
  const { slow } = Route.useLoaderData();
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Await promise={slow}>{(data) => <Chart data={data} />}</Await>
    </Suspense>
  );
}
```

## 404 page

Use the router's `notFoundComponent` on the root route, or throw `notFound()` from a
loader when a record does not exist.

## Feature support

| Feature | Supported |
|---------|-----------|
| Server-side rendering | yes |
| Streaming | yes |
| Server functions | yes |
| Server routes (API) | yes |
| Type-safe routing | yes |
| File-based routing | yes |
| Nitro presets | no |
