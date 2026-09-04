# SvelteKit

## Contents

- [The adapter](#the-adapter)
- [Scaffold](#scaffold)
- [Preview asset prefix](#preview-asset-prefix)
- [Build settings](#build-settings)
- [Rendering modes](#rendering-modes)
- [Incremental static regeneration](#incremental-static-regeneration)
- [Streaming](#streaming)
- [404 page](#404-page)
- [Not supported yet](#not-supported-yet)
- [Feature support](#feature-support)

SvelteKit 2.4+ is supported. EdgeOne CLI must be 1.2.0 or newer.

## The adapter

**Always required.** SvelteKit cannot build without an adapter, and the one that produces
platform output is `@edgeone/sveltekit`.

```bash
npm install @edgeone/sveltekit
```

```javascript
// svelte.config.js
import adapter from '@edgeone/sveltekit';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
  },
};

export default config;
```

`@sveltejs/adapter-auto` cannot detect this platform, and `@sveltejs/adapter-vercel`,
`-netlify`, `-cloudflare`, `-node` all emit output the builder does not understand. The
one legitimate alternative is `@sveltejs/adapter-static`, and only when every route in
the app is prerendered.

## Scaffold

```bash
npx sv create . --template minimal --types ts --no-add-ons --install npm
```

## Preview asset prefix

SvelteKit's option is `kit.paths.base`:

```javascript
const config = {
  kit: {
    adapter: adapter(),
    ...(process.env.EDGEONE_PREVIEW_ASSET_PREFIX
      ? { paths: { base: process.env.EDGEONE_PREVIEW_ASSET_PREFIX } }
      : {}),
  },
};
```

Note that `paths.base` moves served routes as well as asset URLs — the preview proxy
detects that from the redirect the dev server issues and stops stripping the prefix, so
no further configuration is needed.

## Build settings

- Build command: `npm run build`
- Output directory: whatever `@edgeone/sveltekit` writes; do not override
  `outputDirectory` in `edgeone.json` for a SvelteKit project.

## Rendering modes

Server rendering is the default. Per-page and per-layout overrides go in
`+page.js` / `+page.server.js` / `+layout.js` / `+layout.server.js`:

```javascript
// +page.js — client-side rendering for this route
export const ssr = false;
```

```javascript
// +page.js — prerender this route at build time
export const prerender = true;
```

## Incremental static regeneration

Declared per route, and only effective on SSR routes that are not prerendered:

```javascript
// +page.server.js
export const config = {
  isr: {
    expiration: 60, // revalidate every 60s; false caches indefinitely
  },
};

export const prerender = false; // ISR only applies to SSR routes
```

## Streaming

Return promises from `load` instead of awaiting them:

```javascript
// +page.server.js
export const load = async () => ({
  post: fetch('/api/post').then((r) => r.json()),
  comments: fetch('/api/comments').then((r) => r.json()),
});
```

```svelte
<!-- +page.svelte -->
<script>
  let { data } = $props();
</script>

{#await data.post}
  <p>Loading...</p>
{:then post}
  <h1>{post.title}</h1>
{/await}
```

## 404 page

`src/routes/+error.svelte` catches every unmatched route. A `+error.svelte` inside a
route subtree scopes error handling to that subtree — `src/routes/dashboard/+error.svelte`
handles everything under `/dashboard/*` that a deeper boundary did not catch.

## Not supported yet

- **Observability** — platform metrics and log analysis do not cover SvelteKit routes.

## Feature support

| Feature | Supported |
|---------|-----------|
| Server-side rendering | yes |
| Static site generation | yes |
| Prerender | yes |
| Filesystem-based router | yes |
| Streaming with promises | yes |
| Form actions | yes |
| Hooks | yes |
| Observability | no |
