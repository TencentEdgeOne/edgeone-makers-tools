# Next.js

Next.js 13, 14, and 15 are supported, App Router and Pages Router both. The builder
handles Next.js directly — **no platform adapter, no plugin, nothing to install.**

## Scaffold

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --use-npm --yes
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
