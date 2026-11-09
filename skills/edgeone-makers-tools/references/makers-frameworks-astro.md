# Astro

## Contents

- [The adapter](#the-adapter)
- [Scaffold](#scaffold)
- [Preview asset prefix](#preview-asset-prefix)
- [Build settings](#build-settings)
- [Rendering modes](#rendering-modes)
- [Incremental static regeneration](#incremental-static-regeneration)
- [404 page](#404-page)
- [Not supported yet](#not-supported-yet)
- [Feature support](#feature-support)

Astro 4+ is supported, 5 recommended. The platform runtime is Node.js 22+.

## The adapter

Required whenever `output` is `server` or `hybrid`. A pure `output: 'static'` site builds
to plain files and needs none — but if you later add an API route or middleware, the
adapter becomes required and nothing in the preview will tell you.

```bash
npm install @edgeone/astro
```

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import edgeoneAdapter from "@edgeone/astro";

export default defineConfig({
  output: "server",
  adapter: edgeoneAdapter(),
});
```

Never install `@astrojs/vercel`, `@astrojs/netlify`, `@astrojs/cloudflare`, or
`@astrojs/node` — they emit output this platform cannot serve.

### Adapter options

| Option | Meaning |
|--------|---------|
| `outDir` | Build output directory. Defaults to `.edgeone` |
| `includeFiles` | Glob list of files to force into the server bundle, e.g. `["src/locales/**"]` |
| `excludeFiles` | Glob list to keep out of the server bundle, e.g. `["node_modules/.cache/**"]` |
| `isr` | Per-route revalidation, see below |

## Scaffold

```bash
npm create astro@latest . -- --yes --template minimal --install --no-git
```

## Preview asset prefix

Astro's option is `base`. Read it from the environment so a deployment, which never sets
the variable, still serves the site from `/`:

```javascript
export default defineConfig({
  base: process.env.EDGEONE_PREVIEW_ASSET_PREFIX,
  output: "server",
  adapter: edgeoneAdapter(),
});
```

Omit the key entirely when the variable is unset. Never write the prefix as a literal.

## Build settings

- Build command: `npm run build`
- Output directory: `.edgeone` (the adapter's default `outDir`)

## Rendering modes

Static export — no server runtime at all, so API routes under `src/pages/api/*` and
`src/middleware.ts` will not run:

```javascript
export default defineConfig({ output: "static" });
```

Server rendering, with per-page opt-out back to static:

```javascript
export default defineConfig({ output: "server", adapter: edgeoneAdapter() });
```

```astro
---
// any page — prerender this one at build time
export const prerender = true;
---
```

## Incremental static regeneration

Astro has no page-level ISR export, so it is declared on the adapter. Only applies to
SSR routes that are not prerendered.

```javascript
adapter: edgeoneAdapter({
  isr: {
    routes: {
      "/blog/**": { expiration: 60 },
    },
  },
}),
```

## 404 page

`src/pages/404.astro`. Astro picks it up at build time and serves it with a 404 status.

## Not supported yet

- **`<Image />` optimization** — the component renders, the optimization does not happen.
- **Platform ISR** as a platform feature is separate from the adapter `isr` option above;
  do not expect console-level ISR controls.

Both are on the roadmap; track `@edgeone/astro` releases rather than working around them.

## Feature support

| Feature | Supported |
|---------|-----------|
| Islands architecture | yes |
| Server-side rendering | yes |
| Static site generation | yes |
| Multiple UI frameworks in one project | yes |
| Content collections (MD, MDX) | yes |
| API routes | yes |
| Actions routes | yes |
| Middleware | yes, Astro's own |
| `<Image />` optimization | no |
| Platform ISR | no |
