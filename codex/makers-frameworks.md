---
name: edgeone-makers-frameworks
description: >-
  Web framework support matrix for EdgeOne Makers — which platform adapter each
  full-stack framework needs, where it plugs in, the build output directory, the
  preview asset-prefix option, the 404 convention, version floors, and the
  features the platform does not support yet. Read this whenever a request names
  a web framework: Next.js, Nuxt, Astro, React Router, SvelteKit, TanStack Start,
  Vike, Vite / React / Vue, Hugo, or any other frontend framework.
pathPatterns:
  - astro.config.mjs
  - astro.config.js
  - astro.config.ts
  - svelte.config.js
  - svelte.config.ts
  - vite.config.js
  - vite.config.ts
  - vite.config.mjs
  - next.config.js
  - next.config.mjs
  - nuxt.config.ts
  - nuxt.config.js
  - react-router.config.ts
validate:
  - pattern: "@astrojs/(?:vercel|netlify|cloudflare|node)"
    message: "this is another platform's Astro adapter. EdgeOne Makers needs @edgeone/astro; a foreign adapter builds output this platform cannot serve."
  - pattern: "@sveltejs/adapter-(?:vercel|netlify|cloudflare|node|auto)"
    message: "this is not the EdgeOne SvelteKit adapter. Use @edgeone/sveltekit; adapter-auto cannot detect this platform and adapter-static only works for a fully prerendered site."
  - pattern: "serverWrapper"
    message: "serverWrapper is the @edgeone/vite 1.x API. Version 2.x discovers the framework entry through the Universal Deploy protocol, so the option is both unnecessary and ignored."
  - pattern: "(?:async\\s+)?(?:redirects|rewrites)\\s*(?:\\(|:)"
    message: "this platform does not run Next.js redirects or rewrites. Declare them in edgeone.json instead, which is the only place they take effect."
  - pattern: "nitro(?:V2)?Plugin|@tanstack/start-plugin-nitro"
    message: "the EdgeOne TanStack Start adapter cannot be used alongside a Nitro plugin. Drop the Nitro plugin; an official preset is not published yet."
metadata:
  author: edgeone
  version: "1.0.0"
---

# Web Frameworks

Which framework a request names decides seven things and nothing else. Every framework
runs the same flow — prepare the workspace, write files, install, start the preview,
verify — and differs only in the values below.

| Slot | Why it matters |
|------|----------------|
| Platform adapter | Without it, `deploy` produces output the platform cannot serve. **The preview does not catch this.** |
| Scaffold command | One command holds both the structure and a working version set |
| Preview asset-prefix option | The single option that moves framework-emitted asset URLs |
| Build command + output directory | What `edgeone.json` must declare when it is not the default |
| 404 convention | Different file in every framework |
| Version floor | Below it the platform's adapter or builder does not apply |
| Unsupported features | Generated code that uses one produces a broken site, not an error |

## The adapter is a deploy-time contract, not a preview-time one

`edgeone makers dev` starts **the framework's own dev server** (it reads `devCommand`
from `edgeone.json`, falling back to the `dev` script in `package.json`). The platform
adapter takes no part in that. `edgeone makers deploy` is different: it runs the build
and expects the adapter to have written platform output.

So a project that needs an adapter and does not have one **previews perfectly and
deploys broken**. Every gate is green. This is the single most expensive mistake
available in this skill, and it is why the adapter column below comes first.

Five frameworks need one: Astro, React Router, SvelteKit, TanStack Start, Vike.
Next.js and Nuxt are supported by the builder directly and need none.

## Read the one document for the framework in the request

| Framework | Read |
|-----------|------|
| Astro | [references/astro.md](references/astro.md) |
| React Router v7 | [references/react-router.md](references/react-router.md) |
| SvelteKit | [references/sveltekit.md](references/sveltekit.md) |
| TanStack Start | [references/tanstack-start.md](references/tanstack-start.md) |
| Vike | [references/vike.md](references/vike.md) |
| Next.js | [references/nextjs.md](references/nextjs.md) |
| Nuxt | [references/nuxt.md](references/nuxt.md) |
| Vite / React / Vue single-page app | [references/vite-spa.md](references/vite-spa.md) |
| Hugo and other static site generators | [references/static-generators.md](references/static-generators.md) |
| Anything else (Docusaurus, Angular, Gatsby, Hexo, Qwik, Remix, Solid) | [references/other-frameworks.md](references/other-frameworks.md) |

Load one. Loading the whole set is 10 documents to answer a question about one framework.

## Custom 404 pages

| Project shape | Where the 404 lives |
|---------------|---------------------|
| Static site generator | any `404.html` in the build output directory |
| Single-page app | a catch-all client route. **Do not** put `404.html` at the output root — it shadows the client router |
| Next.js App Router | `app/not-found.tsx` |
| Nuxt | `app/error.vue` |
| Astro | `src/pages/404.astro` |
| React Router v7 | export `ErrorBoundary` from `app/root.tsx` |
| SvelteKit | `src/routes/+error.svelte`, or one per route subtree |

## Machine-readable profiles

The host reads this block to decide which adapter a project is missing, which package to
add to the first install, and which output directory to expect. It is the same data the
documents above describe in prose — kept here in one parseable place so the compatibility
lint and the install warmup do not each carry their own copy.

Keep it in sync with the per-framework documents.

- `detect` names the dependencies that prove the framework is in use.
- `adapter.configFiles` is where the adapter gets wired in.
- `adapter.required` is `always` when the framework cannot build without an adapter, or
  `server-output` when a fully static build needs none.
- `serverOutput` answers "does this project render on a server", which is often a
  *different file* from the one the adapter goes in — React Router declares `ssr` in
  `react-router.config.ts` while its adapter is a `vite.config.ts` plugin. `default`
  mirrors the framework's own default when nothing says otherwise, and the pattern named
  for the other mode is what overrides it.

<!-- makers-framework-profiles:start -->
```json
[
  {
    "id": "astro",
    "label": "Astro",
    "detect": ["astro"],
    "adapter": {
      "package": "@edgeone/astro",
      "configFiles": ["astro.config.mjs", "astro.config.js", "astro.config.ts"],
      "required": "server-output"
    },
    "serverOutput": {
      "files": ["astro.config.mjs", "astro.config.js", "astro.config.ts"],
      "default": "static",
      "serverPattern": "output\\s*:\\s*['\"](?:server|hybrid)['\"]"
    },
    "outputDirectory": ".edgeone",
    "unsupported": ["Image component optimization", "platform ISR"]
  },
  {
    "id": "react-router",
    "label": "React Router v7",
    "detect": ["@react-router/dev"],
    "adapter": {
      "package": "@edgeone/react-router",
      "configFiles": ["vite.config.ts", "vite.config.js", "vite.config.mjs"],
      "required": "server-output"
    },
    "serverOutput": {
      "files": ["react-router.config.ts", "react-router.config.js"],
      "default": "server",
      "staticPattern": "ssr\\s*:\\s*false"
    },
    "outputDirectory": "build",
    "unsupported": []
  },
  {
    "id": "sveltekit",
    "label": "SvelteKit",
    "detect": ["@sveltejs/kit"],
    "adapter": {
      "package": "@edgeone/sveltekit",
      "configFiles": ["svelte.config.js", "svelte.config.ts"],
      "required": "always"
    },
    "outputDirectory": "",
    "unsupported": ["observability"]
  },
  {
    "id": "tanstack-start",
    "label": "TanStack Start",
    "detect": ["@tanstack/react-start", "@tanstack/solid-start"],
    "adapter": {
      "package": "@edgeone/tanstack-start",
      "configFiles": ["vite.config.ts", "vite.config.js", "vite.config.mjs"],
      "required": "always"
    },
    "outputDirectory": "",
    "unsupported": ["Nitro plugins alongside the adapter"]
  },
  {
    "id": "vike",
    "label": "Vike",
    "detect": ["vike"],
    "adapter": {
      "package": "@edgeone/vite",
      "configFiles": ["vite.config.ts", "vite.config.js", "vite.config.mjs"],
      "required": "server-output"
    },
    "serverOutput": {
      "files": ["vite.config.ts", "vite.config.js", "vite.config.mjs", "pages/+config.js", "pages/+config.ts"],
      "default": "server",
      "staticPattern": "prerender\\s*:\\s*true"
    },
    "outputDirectory": "dist",
    "unsupported": ["server-side API routes — put them in cloud-functions/ instead"]
  },
  {
    "id": "nextjs",
    "label": "Next.js",
    "detect": ["next"],
    "adapter": null,
    "outputDirectory": ".next",
    "unsupported": ["redirects and rewrites in next.config — declare them in edgeone.json"]
  },
  {
    "id": "nuxt",
    "label": "Nuxt",
    "detect": ["nuxt"],
    "adapter": null,
    "outputDirectory": ".output",
    "unsupported": ["Nuxt Layers", "@nuxt/image optimization"]
  }
]
```
<!-- makers-framework-profiles:end -->
