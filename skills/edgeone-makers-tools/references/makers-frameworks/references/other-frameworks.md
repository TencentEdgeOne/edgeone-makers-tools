# Other frameworks

No framework allowlist exists. Deployment detects the framework, runs its build, and
uploads the output — so a framework's absence from this skill is not evidence that it
does not work. It means nobody wrote down its seven values yet.

When a request names a framework not covered by a document in this skill, derive the
values instead of refusing:

1. **Does it emit a server bundle?** If yes, it needs a platform adapter, and if
   `@edgeone/<framework>` does not exist on npm, `@edgeone/vite` covers any
   Vite-based framework through the Universal Deploy protocol. If it emits static files
   only, no adapter is needed.
2. **Build command and output directory** — read them from the framework's own docs and
   declare them in `edgeone.json` when they are not `npm run build` into a conventional
   directory.
3. **Preview asset prefix** — nearly every framework has one option for this. It is
   `base` in anything Vite-based, `baseURL` / `baseUrl` / `basePath` elsewhere. Read it
   from `EDGEONE_PREVIEW_ASSET_PREFIX` and omit the key when unset.

One preview attempt settles what the docs leave ambiguous. Build it and report what
happened rather than asking the user to pick a different framework.

## Known values

### Angular

- Scaffold: `npx @angular/cli@latest new app --directory . --skip-git --defaults`
- Build command: `npm run build`
- Output directory: `dist/<project-name>/browser` for Angular 17+, `dist/<project-name>` before that
- Adapter: none for a static build
- 404: a wildcard route `{ path: '**', component: NotFoundComponent }` plus the
  single-page app rewrite in `edgeone.json`
- Preview asset prefix: `baseHref` in `angular.json`, or `--base-href` on the build

### Gatsby

- Scaffold: `npx gatsby new .`
- Build command: `npm run build`
- Output directory: `public`
- Adapter: none — Gatsby builds static output
- 404: `src/pages/404.js`
- Preview asset prefix: `pathPrefix` in `gatsby-config.js`, built with `--prefix-paths`

### Remix (v2)

- Build command: `npm run build`
- Output directory: `build/client`
- Adapter: Remix v2 needs a server adapter for SSR. Prefer migrating to React Router v7,
  which has a first-party platform adapter — see
  [react-router.md](react-router.md).
- 404: a splat route `app/routes/$.tsx`

### Solid Start

- Scaffold: `npm init solid@latest`
- Build command: `npm run build`
- Output directory: `.output/public` for a static preset
- Adapter: Vite-based, so `@edgeone/vite` for a server build
- 404: `src/routes/*404.tsx`

### Qwik

- Scaffold: `npm create qwik@latest`
- Build command: `npm run build`
- Output directory: `dist`
- Adapter: `@edgeone/vite` when server rendering
- 404: `src/routes/[...404]/index.tsx`

### Preact / Lit / Alpine

Vite single-page apps in every practical respect — see
[vite-spa.md](vite-spa.md), including the catch-all rewrite that client-side
routing requires.

## When something genuinely does not work

Report what failed with the output that proves it: the build log line, the lint rule ID,
the failing request. A limit you cannot cite is not a limit worth telling the user about.
