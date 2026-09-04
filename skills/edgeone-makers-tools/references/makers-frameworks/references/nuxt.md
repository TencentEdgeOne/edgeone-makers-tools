# Nuxt

## Contents

- [Scaffold](#scaffold)
- [Preview asset prefix](#preview-asset-prefix)
- [Build settings](#build-settings)
- [Rendering modes](#rendering-modes)
- [Server routes](#server-routes)
- [404 page](#404-page)
- [Not supported yet](#not-supported-yet)
- [Feature support](#feature-support)

Nuxt 3 and 4 are supported. The builder handles Nuxt directly — **no platform adapter to
install.** Nitro's own preset detection does the work.

## Scaffold

```bash
npx nuxi@latest init . --packageManager npm --no-gitInit --force
```

## Preview asset prefix

Nuxt's option is `app.baseURL`. It moves both routes and assets; the preview proxy
detects that from the dev server's redirect and adjusts, so no extra configuration is
needed.

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  app: {
    baseURL: process.env.EDGEONE_PREVIEW_ASSET_PREFIX,
  },
});
```

An unset variable leaves `baseURL` undefined and Nuxt falls back to `/`.

## Build settings

| Mode | Build command | Output directory |
|------|---------------|------------------|
| Server rendering (default) | `npm run build` | `.output` |
| Static generation | `npm run generate` | `.output/public` |

## Rendering modes

Server rendering is the default. Turn a route into a single-page app or prerender it
through `routeRules`:

```typescript
export default defineNuxtConfig({
  routeRules: {
    "/": { prerender: true },
    "/blog/**": { isr: 60 },
    "/admin/**": { ssr: false },
  },
});
```

Full static generation for the whole site:

```typescript
export default defineNuxtConfig({ ssr: true, nitro: { prerender: { crawlLinks: true } } });
```

## Server routes

Nitro server routes under `server/api/` work:

```typescript
// server/api/posts.get.ts
export default defineEventHandler(async () => {
  const posts = await $fetch("https://api.example.com/posts");
  return posts;
});
```

## 404 page

`app/error.vue` (Nuxt 4) or `error.vue` at the project root (Nuxt 3). Check
`error.statusCode` to separate 404 from 500:

```vue
<script setup>
const props = defineProps({ error: Object });
</script>

<template>
  <div>
    <h1 v-if="props.error.statusCode === 404">Page not found</h1>
    <h1 v-else>Something went wrong</h1>
    <NuxtLink to="/">Go home</NuxtLink>
  </div>
</template>
```

## Not supported yet

- **Nuxt Layers.** `extends` in `nuxt.config.ts` does not resolve here. Inline whatever
  the layer provided directly into the project.
- **`@nuxt/image` optimization.** The component renders and the image loads; the
  optimization pipeline does not run.

## Feature support

| Feature | Supported |
|---------|-----------|
| Server-side rendering | yes |
| Static site generation | yes |
| Incremental static regeneration | yes |
| Hybrid rendering via `routeRules` | yes |
| Server routes (`server/api`) | yes |
| Auto-imports | yes |
| Nuxt modules | yes |
| Nuxt Layers | no |
| `@nuxt/image` optimization | no |
