# Vite single-page apps (React, Vue, Svelte, Solid, vanilla)

A plain Vite app builds to static files. **No platform adapter is needed** — there is no
server bundle to emit. Install `@edgeone/vite` only when the app grows a server entry.

This is the right default for most requests that do not explicitly ask for server
rendering: it is the fastest to build, the fastest to deploy, and has the fewest ways to
fail.

## Scaffold

```bash
npm create vite@latest . -- --template react-ts
```

Templates: `react-ts`, `react`, `vue-ts`, `vue`, `svelte-ts`, `solid-ts`, `vanilla-ts`,
`preact-ts`, `lit-ts`, `qwik-ts`.

## Preview asset prefix

```typescript
// vite.config.ts
export default defineConfig({
  base: process.env.EDGEONE_PREVIEW_ASSET_PREFIX,
  plugins: [react()],
});
```

Vite treats an undefined `base` as `/`, so a deployment needs no special case.

## Build settings

- Build command: `npm run build`
- Output directory: `dist`

## Client-side routing needs a rewrite

This is the one thing a single-page app must get right. Without it, a deep link like
`/dashboard/settings` returns 404 on refresh because no such file exists in `dist` — the
client router never gets a chance to run.

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Put that in `edgeone.json`. Use `rewrites`, not `redirects`: a rewrite serves
`index.html` while the browser keeps the original URL, which is what the client router
needs to read. A redirect would change the URL and lose the route.

## 404 page

A catch-all route in the client router:

```tsx
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

**Do not** add a `404.html` to the output root. Combined with the catch-all rewrite above
it produces conflicting behaviour, and on its own it shadows the client router for every
unmatched path.

## Adding a backend

A Vite app has no server. When the request needs one, put HTTP endpoints in
`cloud-functions/` and call them with `fetch` from the client. Reach for a full-stack
framework only when the request actually needs server rendering.

## Feature support

| Feature | Supported |
|---------|-----------|
| Static build | yes |
| Client-side routing | yes, with the rewrite above |
| Environment variables (`VITE_` prefix) | yes |
| Code splitting | yes |
| Server-side rendering | not in this shape — use a full-stack framework |
