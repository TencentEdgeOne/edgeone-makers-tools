# Debugging & Troubleshooting

## Local Preview / Dev Server Verification

> **Scope: WorkBuddy only.** The symptoms and conclusions below were verified by hands-on testing in the **WorkBuddy** environment.
> **Other hosts such as CodeBuddy are unverified and may behave differently** — when you hit a local dev-server
> verification issue in CodeBuddy, follow the "Diagnosis procedure" below to test with a probe + server-side logs, then decide whether this applies. Do not apply it blindly.

⚠️ When verifying the local service started by `edgeone makers dev` in **WorkBuddy**, **never use the Bash `curl` inside the WorkBuddy sandbox to judge success or failure**.

### Symptom (observed in WorkBuddy)
- Running `curl http://localhost:8088/` in WorkBuddy's Bash tool returns `404` + an HTML fallback page for any path
  (`/`, `index.html`, `style.css`, `/api/*`).
- Yet at the same moment: `curl` to the same address from the user's system terminal returns `200`, and the browser / WorkBuddy built-in browser preview renders the page perfectly.

### Root cause (WorkBuddy)
WorkBuddy's **Bash tool runs in an isolated sandbox network** that **cannot reach** the host network where the dev server lives.
Inside the sandbox, `localhost:8088` is routed to an internal sandbox fallback service that returns `404` for any path —
**the request never reaches the real dev server** (the proof: these requests never appear in the dev server's access log).
This is **unrelated** to project code, static hosting, or the `setLocalData` EPERM.

### Correct verification methods (WorkBuddy, in priority order)
1. **WorkBuddy built-in browser preview** (pass `http://localhost:8088/` to `present_files`) — uses the host network, reliable.
2. **Have the user verify from their system terminal**: `curl -I http://localhost:8088/` or just open it in a browser.
3. **Deploy live directly** and verify with the real URL (closest to the production environment).

### Forbidden / misconceptions (WorkBuddy)
- ❌ Do not judge whether the dev server is alive by the status code of WorkBuddy sandbox Bash `curl localhost:<port>`.
- ❌ Do not rationalize "`setLocalData` EPERM printed first" into "it dragged down the static service" —
  `Development server is running` / `Running at: 8088` in the logs already proves the service started fine.

### Diagnosis procedure (host-agnostic; must use log evidence, not causal guesswork)
1. Send a probe with a unique marker: `curl ".../__probe_unique_xxx__"`.
2. Check **whether** this `__probe_unique_xxx__` appears in the dev server's access log:
   - Present → the request arrived, the 404 came from the server; check static routing / directory config next.
   - Absent → the request never arrived (in WorkBuddy this means sandbox network isolation); switch to the built-in browser preview or the system terminal — the problem is not in the project.

### Appendix: `setLocalData` EPERM (observed in WorkBuddy; a separate issue that does not affect static serving)
- Symptom: `[File] setLocalData error [EPERM ... open '~/.edgeone/...']`.
- Cause: WorkBuddy sandbox isolation forbids writing to `~/.edgeone` under home (not the project directory), but allows writing to the current project directory.
- Impact: affects only the CLI's local state persistence (login state / daily-choice memory); it does **not** affect static hosting or page access.
- To make the CLI robust in sandbox / CI / read-only-home environments: on a write failure (EPERM/EACCES) it can fall back to
  the `.edgeone/` under the project directory or the path given by `EDGEONE_STATE_DIR`, but it should keep `~/.edgeone` as the preferred location to preserve cross-project shared login state.

## General Issues

| Issue | Solution |
|-------|----------|
| Function not found / 404 | Check file location matches expected route path under `cloud-functions/` |
| Env vars not available | Run `edgeone makers env pull` and restart dev server |
| Hot reload not working | Check you're using `edgeone makers dev`, not a custom dev server |
| Middleware runs on static assets | Add `config.matcher` to limit middleware to specific paths |

## Edge Functions

| Issue | Solution |
|-------|----------|
| `require is not defined` | Edge Functions use ES modules — use `import` instead |
| npm package fails | Edge Functions don't support npm — move to Cloud Functions (Node.js) |
| `Response.json()` not available | Use `new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })` |
| Exceeds CPU limit | Move heavy computation to Cloud Functions (120s limit vs 200ms) |

## KV Storage

| Issue | Solution |
|-------|----------|
| KV returns `undefined` | Run `edgeone makers link` first to connect your project |
| `ReferenceError: my_kv is not defined` | KV not enabled or namespace not bound — enable KV in the console, create namespace, and bind to project |
| Accessing `context.env.KV` returns `undefined` | KV is a **global variable**, not on `context.env` — use `my_kv.get(...)` directly |
| KV `get()` returns a Promise | Missing `await` — always `await` KV operations |
| KV not working in Cloud Functions | KV is only available in Edge Functions — use an external database for Cloud Functions |

## Cloud Functions — Node.js

| Issue | Solution |
|-------|----------|
| Express `app.listen()` error | Remove `app.listen()` — export the app directly with `export default app` |
| WebSocket not connecting | Ensure you're using Cloud Functions (Node.js), not Edge Functions |
| `res.send()` not working | Non-framework functions return Web `Response` objects, not Express-style `res` |
| Framework routes not matching | Check entry file uses `[[default]].js` pattern and routes don't include the file-system prefix |

## Cloud Functions — Go

| Issue | Solution |
|-------|----------|
| Build fails with Go errors | Ensure `go.mod` exists in project root with correct module path |
| Handler function not found | Handler mode requires `package handler` with an exported func matching `http.HandlerFunc` signature |
| Framework routes return 404 | Check entry file name — it determines the URL prefix (e.g. `api.go` → `/api` prefix) |
| Mixed mode error | Cannot mix Handler and Framework modes — choose one per project |
| Port binding error in Framework mode | Use `r.Run(":9000")` or similar — platform maps the port automatically |

## Cloud Functions — Python

| Issue | Solution |
|-------|----------|
| Python file not registered as route | File must contain entry pattern: `class handler(BaseHTTPRequestHandler)`, `app = Flask(...)`, `app = FastAPI(...)`, or `application = get_wsgi_application()` |
| Import errors / missing dependencies | Add to `cloud-functions/requirements.txt` or project root `requirements.txt` — auto-detect may miss some packages |
| Flask route returns 404 | Framework routes don't include file-system prefix — use `@app.route('/users')` not `@app.route('/api/users')` for `api/index.py` |
| FastAPI async issues | Ensure Python 3.10 compatible async patterns — `async def` handlers work natively |
| Django not working | Use `application = get_wsgi_application()` pattern in entry file |
| `__pycache__` or `venv` causing issues | These directories are auto-excluded from build — no action needed |
