# Hugo and other static site generators

Static site generators produce plain files. **No platform adapter, no `package.json`
required** — the build command and output directory are the entire integration.

## Hugo

```bash
hugo new site . --force
```

- Build command: `hugo --minify`
- Output directory: `public`

Hugo is a Go binary, not an npm package, so there is no `npm install` step and no
`package.json` unless a theme's asset pipeline needs one. Declare the build explicitly
because the default `npm run build` does not exist here:

```json
{
  "buildCommand": "hugo --minify",
  "outputDirectory": "public",
  "devCommand": "hugo server -D --bind 0.0.0.0 --port $PORT"
}
```

Preview asset prefix: Hugo's option is `baseURL`, settable on the command line as
`hugo --baseURL "$EDGEONE_PREVIEW_ASSET_PREFIX"`.

A theme is usually required — `hugo new site` alone produces an empty site that renders a
blank page. Either add a theme or write the layouts in `layouts/`.

## Jekyll

- Build command: `bundle exec jekyll build`
- Output directory: `_site`

## Eleventy

- Build command: `npx @11ty/eleventy`
- Output directory: `_site`

## Hexo

- Build command: `npx hexo generate`
- Output directory: `public`

## VitePress

- Scaffold: `npx vitepress init`
- Build command: `npm run docs:build`
- Output directory: `docs/.vitepress/dist`
- Preview asset prefix: `base` in `.vitepress/config.ts`

## Docusaurus

- Scaffold: `npx create-docusaurus@latest . classic --typescript`
- Build command: `npm run build`
- Output directory: `build`
- Preview asset prefix: `baseUrl` in `docusaurus.config.ts`

## MkDocs

- Build command: `mkdocs build`
- Output directory: `site`

## 404 page

Any `404.html` at the root of the build output directory. The platform serves it for
unmatched paths with a 404 status. Each generator has its own way to produce that file —
Hugo uses `layouts/404.html`, Jekyll a page with `permalink: /404.html`, Eleventy a
template named `404`.

## Feature support

| Feature | Supported |
|---------|-----------|
| Static build | yes |
| Custom build command | yes, via `edgeone.json` |
| Non-npm toolchains (Go, Ruby, Python) | yes |
| Server-side rendering | no — nothing to render |
| Incremental static regeneration | no — rebuild and redeploy instead |
