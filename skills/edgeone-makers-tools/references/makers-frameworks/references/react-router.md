# React Router v7

## Contents

- [The adapter](#the-adapter)
- [Scaffold](#scaffold)
- [Preview asset prefix](#preview-asset-prefix)
- [Build settings](#build-settings)
- [Rendering modes](#rendering-modes)
- [Streaming](#streaming)
- [404 page](#404-page)
- [Feature support](#feature-support)

React Router 7+ is supported with full-stack deployment. EdgeOne CLI must be 1.2.0 or
newer. Version 7 is a Vite-based framework, not just the routing library.

## The adapter

Required for server rendering. A project with `ssr: false` builds to static client output
and needs none — but adding a loader that must run on the server makes it required.

```bash
npm install @edgeone/react-router
```

```typescript
// vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { edgeoneAdapter } from "@edgeone/react-router";

export default defineConfig({
  plugins: [
    reactRouter(),
    edgeoneAdapter(),
  ],
});
```

Note the **named** export `edgeoneAdapter`, called as a plugin.

## Scaffold

```bash
npx create-react-router@latest . --yes --no-git-init --install
```

## Preview asset prefix

This is a Vite project, so the option is `base`:

```typescript
export default defineConfig({
  base: process.env.EDGEONE_PREVIEW_ASSET_PREFIX,
  plugins: [reactRouter(), edgeoneAdapter()],
});
```

Omit it when the variable is unset so the deployed site stays at `/`.

## Build settings

The output directory depends on the rendering mode, which is the one thing about this
framework that is easy to get wrong:

| Mode | Build command | Output directory |
|------|---------------|------------------|
| Server rendering | `npm run build` | `build` |
| Static generation (`prerender`) | `npm run build` | `build/client` |
| Single-page app (`ssr: false`) | `npm run build` | `build/client` |

## Rendering modes

Server rendering — fetch in a `loader`:

```typescript
// routes/post.tsx
import type { Route } from "./+types/post";

export async function loader({ params }: Route.LoaderArgs) {
  const post = await fetchPost(params.id);
  return { post };
}

export default function Post({ loaderData }: Route.ComponentProps) {
  return (
    <article>
      <h1>{loaderData.post.title}</h1>
      <div>{loaderData.post.content}</div>
    </article>
  );
}
```

Static generation — list the routes to prerender in `react-router.config.ts`:

```typescript
import type { Config } from "@react-router/dev/config";

export default {
  async prerender() {
    const posts = await fetchAllPosts();
    return ["/", "/about", ...posts.map((post) => `/blog/${post.slug}`)];
  },
} satisfies Config;
```

Single-page app:

```typescript
import type { Config } from "@react-router/dev/config";

export default { ssr: false } satisfies Config;
```

## Streaming

Return promises from the loader and resolve them with `Await`:

```typescript
import { Suspense } from "react";
import { Await } from "react-router";

export async function loader() {
  return { posts: fetchPosts(), weather: fetchWeather() };
}

export default function Dashboard({ loaderData }) {
  return (
    <div>
      <Suspense fallback={<p>Loading posts…</p>}>
        <Await resolve={loaderData.posts}>
          {(posts) => <PostList posts={posts} />}
        </Await>
      </Suspense>
    </div>
  );
}
```

## 404 page

Export an `ErrorBoundary` from the root route file `app/root.tsx`. React Router's built-in
error boundary mechanism catches unmatched routes, throws a 404 response, and renders
what the boundary returns.

## Feature support

| Feature | Supported |
|---------|-----------|
| Server-side rendering | yes |
| Static site generation | yes |
| Single-page app | yes |
| Route loaders | yes |
| Route actions | yes |
| Nested routes | yes |
| File-based routing | yes |
| Streaming | yes |
| Experimental features | partly |
