# Next.js

## Contents

- [Scaffold](#scaffold)
- [Preview asset prefix](#preview-asset-prefix)
- [In-app navigation](#in-app-navigation)
- [Build settings](#build-settings)
- [Rendering modes](#rendering-modes)
- [404 page](#404-page)
- [Not supported](#not-supported)
- [Feature support](#feature-support)

Next.js 13 through 16 are supported, App Router and Pages Router both, and 15 is the
recommended version. The builder handles Next.js directly — **no platform adapter, no
plugin, nothing to install.**

The scaffold command below pins that recommendation rather than taking `@latest`, which
now produces 16. Unlike `create-react-router`, the pin holds the framework and not just
the generator: `create-next-app` ships its templates inside the published package instead
of fetching the newest from a branch.

## Scaffold

```bash
npx create-next-app@15 . --typescript --tailwind --app --eslint --use-npm --yes
```

## Preview asset prefix

Next.js has two related options and only one of them is right here. Use `assetPrefix`,
which moves asset URLs while leaving routes at `/`. **Do not use `basePath`** — it moves
the routes too, which breaks the preview proxy and, if it survives into a deployment,
breaks the deployed site.

```javascript
// next.config.js
const nextConfig = {
  assetPrefix: process.env.EDGEONE_PREVIEW_ASSET_PREFIX,
};

export default nextConfig;
```

Reading it from the environment matters: a deployment never sets the variable, so the
value collapses to undefined and assets resolve from the root.

## In-app navigation

Use a plain anchor for cross-page navigation — `<a href="/posts">` — rather than
`next/link`. The preview proxy serves the app under a path prefix that it strips before
forwarding, so the framework only ever sees the stripped path. `next/link` intercepts the
click and routes on the client against that path, which lands outside the prefix with
nothing left to correct it from. A plain anchor asks for a fresh document, which the proxy
does see and does rewrite.

**That collides with the lint config the scaffold ships.** `next/core-web-vitals` sets
`@next/next/no-html-link-for-pages` to `error`, and `next build` runs ESLint, so the one
navigation form that survives the proxy is the one the build rejects. Turn that single rule
off and leave the rest gating the build:

```javascript
// eslint.config.mjs
{
  rules: { "@next/next/no-html-link-for-pages": "off" },
}
```

`next dev` does not lint, which is what makes this expensive to find: a multi-page app with
links previews perfectly green, then fails its first deploy with one error per link, minutes
into a build. Do not answer that failure by rewriting the anchors into `next/link` — that
trades a failed deploy for a preview whose navigation goes nowhere.

## Build settings

- Build command: `npm run build`
- Output directory: `.next`

## Rendering modes

Everything the framework offers works: server components, client components, static
generation, incremental static regeneration, streaming with Suspense, route handlers,
server actions, and middleware.

```typescript
// app/blog/[slug]/page.tsx — ISR
export const revalidate = 60;

export async function generateStaticParams() {
  const posts = await fetchPosts();
  return posts.map((post) => ({ slug: post.slug }));
}
```

## 404 page

`app/not-found.tsx` in the App Router, `pages/404.tsx` in the Pages Router.

## Not supported

- **`redirects` and `rewrites` in `next.config.js` do not run.** The platform does not
  read them. Declare both in `edgeone.json`, which is the only place they take effect.

```json
{
  "redirects": [{ "source": "/old", "destination": "/new", "statusCode": 301 }],
  "rewrites": [{ "source": "/api/proxy/:path*", "destination": "/api/:path*" }]
}
```

## Feature support

| Feature | Supported |
|---------|-----------|
| App Router | yes |
| Pages Router | yes |
| Server components | yes |
| Static generation | yes |
| Incremental static regeneration | yes |
| Streaming | yes |
| Route handlers | yes |
| Server actions | yes |
| Middleware | yes |
| Image optimization | yes |
| `next.config` redirects / rewrites | no — use `edgeone.json` |
