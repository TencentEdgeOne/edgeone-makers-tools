# Vike

## Contents

- [The adapter](#the-adapter)
- [Scaffold](#scaffold)
- [Preview asset prefix](#preview-asset-prefix)
- [Build settings](#build-settings)
- [Rendering modes](#rendering-modes)
- [404 page](#404-page)
- [Not supported yet](#not-supported-yet)
- [Feature support](#feature-support)

Vike 0.4.235+ is supported. EdgeOne CLI must be 1.2.0 or newer. Vike is a Vite plugin,
so the platform adapter is the generic Vite one.

## The adapter

Required when the app renders on the server. A fully pre-rendered Vike site is static
output and needs none.

```bash
npm install @edgeone/vite
```

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { edgeone } from "@edgeone/vite";

export default defineConfig({
  plugins: [
    react(),
    vike({ prerender: true }),
    edgeone(),
  ],
});
```

`@edgeone/vite` 2.x discovers the framework entry through the Universal Deploy protocol.
The 1.x `serverWrapper` option no longer does anything — if you find it in a config, the
config was written against the old major and the option should be deleted.

## Scaffold

```bash
npm create vike@latest . -- --react --typescript
```

## Preview asset prefix

```typescript
export default defineConfig({
  base: process.env.EDGEONE_PREVIEW_ASSET_PREFIX,
  plugins: [react(), vike(), edgeone()],
});
```

## Build settings

- Build command: `npm run build`
- Output directory: `dist`

## Rendering modes

Vike sets rendering per page through `+config.js` files, and the setting cascades down the
directory tree.

Pre-render everything:

```javascript
// pages/+config.js
export default { prerender: true };
```

Server rendering for one subtree, overriding a prerendering default:

```javascript
// pages/dashboard/+config.js
export default { prerender: false };
```

Client-only rendering for a page:

```javascript
// pages/admin/+config.js
export default { ssr: false };
```

Per-page data fetching goes in a `+data.js` beside the page:

```javascript
// pages/product/@id/+data.js
export async function data(pageContext) {
  const res = await fetch(`https://api.example.com/products/${pageContext.routeParams.id}`);
  return { product: await res.json() };
}
```

## 404 page

Vike routes unmatched URLs to `pages/_error/+Page.jsx`. Read `pageContext.is404` there to
distinguish a missing page from a server error:

```jsx
export default function Page({ is404 }) {
  return is404 ? <h1>404 — page not found</h1> : <h1>500 — something broke</h1>;
}
```

## Not supported yet

- **Server-side API routes.** Vike's own server route mechanism does not run here. Put
  HTTP endpoints in `cloud-functions/` instead and call them from the page with `fetch`.

## Feature support

| Feature | Supported |
|---------|-----------|
| Server-side rendering | yes |
| Pre-rendering / SSG | yes |
| Client-only rendering | yes |
| Per-page render control | yes |
| Filesystem routing | yes |
| Data fetching hooks | yes |
| Multiple UI frameworks | yes |
| Server-side API routes | no — use `cloud-functions/` |
