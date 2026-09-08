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

React Router 7 is supported with full-stack deployment. EdgeOne CLI must be 1.2.0 or
newer. Version 7 is a Vite-based framework, not just the routing library.

Not 8. `@edgeone/react-router` peers on `react-router@^7` and `@react-router/dev@^7`, and
on Vite 5, 6, or 7 — so the current default scaffold, which is version 8 on Vite 8, falls
outside both. The adapter is a deploy-time contract rather than a preview-time one, so a
project like that previews perfectly and deploys broken with every gate green.

Pinning the CLI does not pin the framework. `create-react-router` downloads its default
template from the `main` branch of `remix-run/react-router-templates`, which tracks the
newest major, so `create-react-router@7` still writes a version 8 manifest. Either pass
`--template` with a ref of your own, or correct the versions after scaffolding.

Correcting the versions is not the whole correction. The scaffolded `vite.config.ts` sets
`resolve.tsconfigPaths`, which is Vite 8's built-in alias resolution and absent in 7 —
where it is not rejected either, because Vite does not validate `resolve`. So `~/*` stays
in tsconfig.json, tsc stays happy, and the first import through the alias fails the build
naming only the import. Going back to Vite 7 means going back to the plugin the template
used before 8:

```typescript
// vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths(), edgeoneAdapter()],
});
```

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

Two options in two files, and the Vite one alone does nothing.

`base` moves the asset URLs:

```typescript
// vite.config.ts
export default defineConfig({
  base: process.env.EDGEONE_PREVIEW_ASSET_PREFIX,
  plugins: [reactRouter(), edgeoneAdapter()],
});
```

`basename` is what matches the requests:

```typescript
// react-router.config.ts
export default {
  ssr: true,
  basename: process.env.EDGEONE_PREVIEW_ASSET_PREFIX ?? "/",
} satisfies Config;
```

Vite strips the prefix off the request before the framework sees it, and React
Router's dev adapter puts it straight back — on purpose, so the router is given
the full path. Against a basename still defaulting to `/` that path matches
nothing, so the assets load and every navigation answers `No route matches URL
"/preview"`. React Router additionally refuses to start in dev unless the
basename begins with the base, which is why both read the same variable.

Both fall back to `/` when the variable is unset, so the deployed site stays at
the root.

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
