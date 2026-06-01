---
name: edgeone-pages-dev
description: >-
  This skill guides development of full-stack features on EdgeOne Pages — Edge Functions,
  Cloud Functions (Node.js / Go / Python runtimes), Middleware, KV Storage, and local dev workflows.
  It should be used when the user wants to create APIs, serverless functions, middleware,
  WebSocket endpoints, or full-stack features specifically on EdgeOne Pages — e.g.
  "create an API", "add a serverless function", "write middleware", "build a full-stack app",
  "add WebSocket support", "set up edge functions", "use KV storage",
  "create a Go API", "build a Python backend", "use Flask/FastAPI/Gin on EdgeOne Pages",
  "创建接口", "写个API", "加个中间件", "写后端", "搭建全栈应用".
  Do NOT trigger for framework-native features (Next.js API routes, Next.js middleware,
  Nuxt server routes) or generic Express/Koa development outside an EdgeOne Pages project.
  Do NOT trigger for deployment — use edgeone-pages-deploy instead.
  Do NOT trigger for other platforms (Cloudflare Workers, Vercel Functions, AWS Lambda).
metadata:
  author: edgeone
  version: "4.0.0"
---

# EdgeOne Pages Development Guide

Develop full-stack applications on **EdgeOne Pages** — Edge Functions, Cloud Functions (Node.js / Go / Python), and Middleware.

## When to use this skill

- Creating APIs, serverless functions, or backend logic on EdgeOne Pages
- Adding middleware for request interception, redirects, auth guards, or A/B testing
- Building full-stack apps with static frontend + server-side functions
- Using KV Storage for edge-side persistent data
- Setting up WebSocket endpoints (Node.js runtime)
- Integrating Express, Koa, Gin, Echo, Flask, FastAPI, or Django on EdgeOne Pages
- Debugging EdgeOne Pages runtime errors (function failures, middleware issues, KV problems)

**Do NOT use for:**
- Deployment → use `edgeone-pages-deploy` skill
- Next.js / Nuxt middleware or API routes → use the framework's own API, NOT the platform `middleware.js`
- Generic Express/Koa/Gin/Flask development outside an EdgeOne Pages project
- Cloudflare Workers, Vercel Functions, or other platforms

## How to use this skill (for a coding agent)

1. Read the **Decision Tree** below to pick the correct runtime
2. Follow the **Routing** table to load the relevant reference file
3. Use the code patterns from that reference to implement the user's request

## ⛔ Critical Rules (never skip)

1. **Choose the right runtime for the task.** Follow the Decision Tree — never guess.
2. **Edge Functions run on V8, NOT Node.js.** Never use Node.js built-in modules (`fs`, `path`, `crypto` from Node) or npm packages in Edge Functions.
3. **Cloud Functions support three runtimes: Node.js, Go, and Python.** Place all function files under `cloud-functions/` directory. The platform detects the language by file extension (`.js`/`.ts` → Node.js, `.go` → Go, `.py` → Python).
4. **Node.js functions return a standard Web `Response` object**, not `res.send()` — unless using Express/Koa via the `[[default]].js` pattern.
5. **Go Handler mode** requires `http.HandlerFunc` signature; **Framework mode** uses standard framework code with auto port/path adaptation.
6. **Python entry files** are identified by class/app patterns (`class handler(BaseHTTPRequestHandler)`, `app = Flask(...)`, `app = FastAPI(...)`). Other `.py` files are treated as helper modules.
7. **Middleware is for lightweight request interception only.** Never put heavy computation or database calls in middleware.
8. **Always use `edgeone pages dev` for local development.** Never run a separate dev server for functions — the CLI handles everything on port 8088.
9. **Never configure `edgeone pages dev` as the `devCommand` in `edgeone.json` or as the `dev` script in `package.json`** — this causes infinite recursion.
10. **For framework projects (Next.js, Nuxt, etc.), use the framework's own middleware** — NOT the platform `middleware.js`.

---

## Technology Decision Tree

```
Request interception / redirect / rewrite / auth guard / A/B test?
  → Middleware                                        → read references/middleware.md

Lightweight API with ultra-low latency (simple logic, no npm)?
  → Edge Functions                                    → read references/edge-functions.md

KV persistent storage? (⚠️ enable KV in console first)
  → Edge Functions + KV Storage                       → read references/kv-storage.md

Blob object storage for uploads, images, files, or JSON datasets?
  → Cloud Functions (Node.js) + Pages Blob SDK         → read references/blob-storage.md

Complex backend with npm packages / database / WebSocket?
  → Cloud Functions (Node.js)                         → read references/node-functions.md

Express or Koa framework?
  → Cloud Functions (Node.js) with [[default]].js     → read references/node-functions.md

High-performance API with Go (Gin / Echo / Chi / Fiber)?
  → Cloud Functions (Go)                              → read references/go-functions.md

Python API with Flask / FastAPI / Django / Sanic?
  → Cloud Functions (Python)                          → read references/python-functions.md

Pure static site with no server-side logic?
  → No functions needed — just deploy static files

Need a project structure template?
  → read references/recipes.md
```

### Runtime Comparison

| Feature | Edge Functions | Cloud Functions (Node.js) | Cloud Functions (Go) | Cloud Functions (Python) | Middleware |
|---------|--------------|--------------------------|---------------------|------------------------|------------|
| **Runtime** | V8 (like CF Workers) | Node.js v20.x | Go 1.26+ | Python 3.10 | V8 (edge) |
| **npm/packages** | ❌ Not supported | ✅ Full npm ecosystem | ✅ Go modules | ✅ pip (auto-detect) | ❌ Not supported |
| **Max code size** | 5 MB | 128 MB | 128 MB | 128 MB (incl. deps) | Part of edge bundle |
| **Max request body** | 1 MB | 6 MB | 6 MB | 6 MB | N/A (passes through) |
| **Max CPU / wall time** | 200 ms CPU | 120 s wall clock | 120 s wall clock | 120 s wall clock | Lightweight only |
| **KV Storage** | ✅ Yes (global variable) | ❌ No | ❌ No | ❌ No | ❌ No |
| **WebSocket** | ❌ No | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Framework support** | — | Express, Koa | Gin, Echo, Chi, Fiber | Flask, FastAPI, Django, Sanic | — |
| **Use case** | Lightweight APIs, edge compute | Complex APIs, full-stack | High-perf APIs, compiled speed | Data science, ML, rapid prototyping | Request preprocessing |

### Cloud Functions — Language Comparison

| Feature | Node.js | Go | Python |
|---------|---------|-----|--------|
| **File extension** | `.js` / `.ts` | `.go` | `.py` |
| **Handler style** | `export function onRequest(ctx)` → `Response` | `func Handler(w, r)` (Handler) or `func main()` (Framework) | `class handler(BaseHTTPRequestHandler)` or framework app instance |
| **Framework mode** | Express/Koa via `[[default]].js` | Gin/Echo/Chi/Fiber via entry `.go` file | Flask/FastAPI/Django via entry `.py` file |
| **Dependency management** | `package.json` (npm) | `go.mod` (auto) | `requirements.txt` + auto-detect |
| **Dev modes** | Handler / Framework | Handler / Framework | Handler / WSGI / ASGI |

---

## Routing

| Task | Read |
|------|------|
| Edge Functions (lightweight APIs, V8 runtime, KV Storage) | [references/edge-functions.md](references/edge-functions.md) |
| KV Storage (persistent key-value storage on edge) | [references/kv-storage.md](references/kv-storage.md) |
| Blob Storage (object files, browser uploads, images, JSON datasets) | [references/blob-storage.md](references/blob-storage.md) |
| Cloud Functions — Node.js (npm, database, Express/Koa, WebSocket) | [references/node-functions.md](references/node-functions.md) |
| Cloud Functions — Go (Gin, Echo, Chi, Fiber, net/http) | [references/go-functions.md](references/go-functions.md) |
| Cloud Functions — Python (Flask, FastAPI, Django, Sanic, Handler) | [references/python-functions.md](references/python-functions.md) |
| Middleware (redirects, rewrites, auth guards, A/B testing) | [references/middleware.md](references/middleware.md) |
| Project structure templates and common recipes | [references/recipes.md](references/recipes.md) |
| Debugging and troubleshooting | [references/troubleshooting.md](references/troubleshooting.md) |

---

## Environment Setup

Before executing **any** `edgeone` CLI command (`pages init`, `pages dev`, `pages link`, `pages env pull`, etc.), set the following environment variable in the current shell session:

```bash
export PAGES_SOURCE=skills
```

Or prefix each command inline:

```bash
PAGES_SOURCE=skills edgeone pages dev
```

This tells the platform that the command is triggered from an AI skill context.

---

## Project Setup (Quick Start)

Initialize the project:

```bash
export PAGES_SOURCE=skills   # Required before any edgeone command
edgeone pages init
```

Start local development:

```bash
edgeone pages dev            # Serves everything on http://localhost:8088/
```

Link project (required for KV & env vars):

```bash
edgeone pages link
```

Manage environment variables:

```bash
edgeone pages env pull       # Pull from console to local .env
```

Access env vars in functions via `context.env.KEY` (Node.js), `os.Getenv("KEY")` (Go), or `os.environ.get("KEY")` (Python).

For detailed project structures and recipes, see [references/recipes.md](references/recipes.md).
