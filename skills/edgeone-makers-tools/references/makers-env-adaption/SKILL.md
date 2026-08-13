---
name: edgeone-makers-env-adaption
description: >-
  Environment-specific adaptation rules for EdgeOne Makers Skills running in
  sandboxed or restricted AI coding environments (e.g. WorkBuddy).
  Trigger when: the user is working in WorkBuddy or a sandboxed IDE where CLI prompts hang and network is proxy-isolated (but browser login still works).
  Covers: non-interactive CLI flags, network isolation workarounds, login in sandbox,
  proxy bypass, file preview constraints (MUST use http:// via dev server, NEVER file://,
  NEVER python -m http.server / npx serve), dev server requirements.
pathPatterns:
  - "*.sh"
  - package.json
validate:
  - pattern: "python\\s+-m\\s+http\\.server|npx\\s+(serve|http-server)"
    message: "Use `edgeone makers dev` — self-hosted static servers skip Blob credentials, Cloud Functions routing, Edge Functions and middleware."
  - pattern: "localhost:80(88|89)"
    message: "Use 127.0.0.1, not localhost — in the sandbox localhost resolves to ::1 and yields false 404s."
metadata:
  author: edgeone
  version: "1.1.1"
---

# Runtime Environment Adaptation Guide

> This document describes the special constraints and adaptation rules for EdgeOne Makers Skills across different AI coding environments.
> Currently covered: **WorkBuddy** (Tencent sandboxed IDE)

---

## 🚦 Quick Reference: Preview Decision Tree

When you reach the "display / preview" step, **read this first before deciding how to call `present_files`**:

```
            ┌─ Delivering finished work? ── Yes ──→ present_files(deployed EdgeOne URL) ✅
            │
Enter       ┤
preview     │                      ┌─ dev server running? ─ Yes ──→ present_files(http://127.0.0.1:8088/) ✅
            └─ Still iterating? ───┤
                                    └─ No ──→ start edgeone makers dev → present_files(...)
```

| What you want to do | Correct approach | Wrong approach (breaks) |
|---|---|---|
| Preview local dev server | `present_files("http://127.0.0.1:8088/")` | ❌ Passing `/path/to/index.html` (IDE opens it via file://) |
| Preview a deployed project | `present_files(deploy_url)` with `?eo_token=...` | ❌ Passing a local `dist/index.html` path |
| Start dev server | `edgeone makers dev --name <p> --skip-env-sync` | ❌ `python -m http.server` / `npx serve` |
| Verify dev server is up (agent-side API check) | `curl --noproxy '*' http://127.0.0.1:8088/api/...` ✅ works (same sandbox) | ❌ `curl localhost:8088` / plain `curl` (proxy + IPv6 → 404/000) |
| Verify dev server is up (user-facing) | `present_files(http://127.0.0.1:8088/)` (platform tunnel) | ❌ Telling user to open `127.0.0.1:8088` — their browser can't reach the sandbox |

**Core iron rule**: inside a Makers project, **any HTML / URL preview MUST go through the HTTP protocol**. `file://` looks convenient, but fetch / SSE / Blob / KV all break under it.

### Violation symptoms self-check (if you see these, go back up immediately)

- Browser Console: `TypeError: Failed to fetch` / `CORS policy` errors
- Page HTML loads fine but all JS requests 404
- SSE / EventSource disconnects immediately on connect
- Works locally but breaks once deployed (or vice versa)

---

## WorkBuddy Sandbox Environment

WorkBuddy is a sandboxed remote IDE environment. When running AI coding tasks, it has the following constraints that differ from local development.

> **⚠️ Common misread: WorkBuddy is a *desktop IDE sandbox*, NOT a headless environment.**
> - CLI **interactive prompts** (site picker, confirmations) hang inside the sandbox → use the non-interactive flags in this section.
> - **BUT browser login (`edgeone login --site <x>`) works fully** — WorkBuddy launches the host OS browser AND routes the OAuth callback back into the sandbox.
>
> Deploy/link login should default to browser login and only fall back to `-t <token>` after browser login is confirmed to fail. Do NOT jump to token login just because the caller is an "Agent".

---

### 1. Non-interactive mode (all CLI commands must avoid interactive prompts)

Inside the WorkBuddy sandbox, CLI interactive prompts cause the process to hang forever. All `edgeone` CLI commands must carry non-interactive flags:

| Scenario | Required flag | Reason |
|------|---------|------|
| Local development | `--skip-env-sync` | Skips the "sync environment variables?" confirmation |
| Linking a project | `--name <project>` | Skips the interactive project picker |
| Auth when not logged in | `-t <token>` | Passes the token directly, no login popup |
| Deploy output | `--json` | Machine-readable JSON, avoids ANSI parsing |

```bash
# Correct: local development
edgeone makers dev --name my-project --skip-env-sync

# Correct: deploy
edgeone makers deploy -n my-project --json

# Wrong: will hang
edgeone makers dev
```

---

### 2. Login authentication

**Token resolution priority** (the CLI checks in this order automatically):
1. `-t <token>` command-line argument
2. `EDGEONE_PAGES_API_TOKEN` environment variable
3. `<cwd>/.edgeone/auth.json` (written by `edgeone login --local`)
4. `~/.edgeone/` global credentials

**Recommended approach**: browser login + the `--local` flag:
```bash
edgeone login --site china --local
```
`--local` writes credentials to the project directory at `<cwd>/.edgeone/auth.json`, bypassing home-directory write restrictions.

**Login status detection**:
```bash
edgeone whoami  # exit 0 = logged in, exit 1 = not logged in (does not hang)
```

**When is login actually required?** Login is only needed when the project uses **Blob** or other credentialed backends — and strictly because of the dependency chain: **Blob requires the project to be linked, and linking requires a logged-in account first.** So `edgeone makers dev` for a **pure-static** site runs fine without login — **do NOT force a login prompt for static-only previews**. Login (or `-t <token>`) becomes mandatory the moment dev/deploy must touch Blob storage. (The trigger condition and the link chain live in makers-storage.)

**CLI version requirement**: >= 1.6.7 (older versions lack the non-interactive fixes; whoami will hang)

---

### 3. Network isolation (dev server reachability from Bash)

The Bash tool and `edgeone makers dev` run **in the same sandbox (same machine)**, so the loopback dev server IS reachable from Bash. The earlier claim that "Bash curl is isolated and returns 404" is wrong — the failures are caused by the **proxy** (§5) and the **IPv6 localhost** (§4), not by network isolation.

| Verification method | Availability | Notes |
|---------|--------|------|
| Built-in browser preview (`present_files`) | ✅ Available | Uses the platform tunnel; the ONLY way the **user's** browser can see the sandbox dev server |
| User's system terminal | ✅ Available | `curl http://127.0.0.1:8088/` |
| Bash tool curl (agent-side API checks) | ✅ Available **only with `--noproxy '*'` + `127.0.0.1`** | Plain `curl localhost:8088` fails: (a) `localhost`→`::1` (§4), (b) proxy hijacks the request (§5) |

**Practical rule**:
- Use `curl --noproxy '*' http://127.0.0.1:8088/...` from Bash to **agent-side verify** API endpoints during testing — this works (it was used to validate a full create→upload→like flow).
- Do NOT rely on Bash curl to show the page to the user. The user's browser cannot reach `127.0.0.1:8088` inside the sandbox; for a user-facing preview, pass the dev URL to `present_files` (platform tunnel) or deploy and share the live URL.

---

### 4. Force IPv4 (127.0.0.1, not localhost)

The dev server listens on the IPv6 dual stack (`::`), but in the sandbox `localhost` resolves to `::1`, causing false 404s.

```bash
# Correct
curl http://127.0.0.1:8088/

# Wrong (404 in the sandbox)
curl http://localhost:8088/
```

The preview URL must also use `127.0.0.1`:
```
present_files: http://127.0.0.1:8088/
```

---

### 5. Proxy hijacking (curl needs --noproxy)

The sandbox injects an `http_proxy` environment variable; curl goes through the proxy by default, which swallows the SSE streaming response.

```bash
# Correct
curl --noproxy '*' http://127.0.0.1:8088/api/chat

# Wrong (returns "Empty reply" / status 000)
curl http://127.0.0.1:8088/api/chat
```

The built-in browser preview is not affected by the proxy.

---

### 6. Home directory write restriction

The sandbox blocks writes to `~/.edgeone/`, but allows writes to the project directory.

| Path | Writable | Notes |
|------|------|------|
| `<cwd>/.edgeone/` | ✅ | Where `--local` writes |
| `~/.edgeone/` | ❌ | EPERM error |

A `setLocalData EPERM` does not affect the running service; it only affects the CLI's local state persistence.

---

### 7. Command execution mode (sync vs async)

| Command | Execution mode | Reason |
|------|---------|------|
| `npm install` | **Foreground sync** | Usually 10-30s; running it in the background would leave later commands missing dependencies |
| `edgeone makers dev` | **Background async** (`run_in_background`) | Long-running process, must not block the conversation |
| `edgeone makers deploy` | **Background async** (`run_in_background`) | Cold deploys (build → upload → Process → live) routinely take **2–10+ minutes**. The foreground wall-clock budget (~100s) SIGKILLs the CLI mid-deploy (exit 137) even while it keeps printing progress — you lose the final URL line. Run it in the background and wait for the completion notification. |

#### 7.2 Deploy in background — why, and what the kill really means

- **Foreground kill = wall-clock budget, not a hang.** A foreground Bash command in this sandbox has a fixed ~100s wall-clock budget; at the limit the whole process tree gets SIGKILL (`exit 137 = 128 + 9`), regardless of whether it keeps printing. During a deploy the CLI prints `Deployment in progress... elapsed: ~XXs` every ~10s — those heartbeat lines do NOT reset or extend the budget. So "still printing → killed at ~100s" is expected, not a stall.
- **Killing the CLI does NOT usually fail the deploy.** The deployment itself runs server-side. A foreground CLI killed at `Created deployment` / `Process` has very likely continued on the server and gone live (confirmed in practice: a deploy killed at ~100s was later verified live, took ~674s end-to-end). Re-running `deploy` (same `-n <project>`) reuses the project and returns the URL.
- **Always use `run_in_background: true` for deploy** so the CLI survives past the foreground budget and emits the final `--json` line with the live URL. Do not poll the task across turns — rely on the `<task-notification>` completion event. (Cross-turn `TaskOutput` may report the handle as "not found"; the process still finished.)
- **`--json` still prints progress heartbeats** to stdout/stderr, not a single clean JSON line. Parse the **last** line for the result object; treat the progress lines as noise. (This is a CLI cleanliness issue, unrelated to the kill behavior — do not assume "no output = process ended"; the sandbox judges liveness by OS process state, not by stdout bytes.)
- **Clean up background processes** after use: a `edgeone makers dev` left running keeps holding port 8088 and may collide with the next dev/deploy. Stop it with `TaskStop` or kill it when the session moves on.

### 7.1 Preview & Dev Server full flow (MUST use HTTP, file:// forbidden)

After finishing development, **start the dev server and preview directly** — do not ask "do you want to preview?". Full flow:

> ⚠️ **WorkBuddy default behavior**: when you create an HTML file the platform may auto-open a preview via file:// — **ignore it**, that is not a valid preview. You must wait until `edgeone makers dev` is up, then re-open via the HTTP URL to override it.

1. Start `edgeone makers dev --name <project> --skip-env-sync` (**background async**, see §7)
2. Wait 2-3 seconds for the dev server to be ready
3. **Pass `http://127.0.0.1:8088/` to `present_files`** (note it is `127.0.0.1`, **not** `localhost` — see §4)
4. Tell the user: "The project's local preview is running, please check it out. If everything looks good, I can deploy it live for you directly."

Only after the user confirms, run `edgeone makers deploy -n <project> --json` (**background async**, see §7 and §7.2 — it exceeds the foreground wall-clock budget).

#### ⛔ file:// preview is strictly forbidden

**Never** pass a local HTML path to `present_files` — the IDE opens it via the `file://` protocol, which breaks fetch / SSE / Blob / KV entirely. **No exceptions, no "just a quick look" scenario.**

```bash
# ✅ Correct
present_files("http://127.0.0.1:8088/")                                       # dev server
present_files("https://my-app-w9t0lxe8.edgeone.cool?eo_token=...")            # after deploy (full URL with query params)

# ❌ Wrong (IDE opens via file://, all APIs fail)
present_files("/Users/foo/dist/index.html")
present_files("./dist/index.html")
present_files("file:///Users/foo/dist/index.html")

# ❌ Wrong (truncated query params — the user gets a 401 when they open it)
present_files("https://my-app-w9t0lxe8.edgeone.cool")                         # missing ?eo_token=...
```

⚠️ **URL truncation = 401**: the deploy URL's `?eo_token=...&eo_time=...` are auth parameters; if truncated, the user gets a 401 UNAUTHORIZED when they open it. **Every URL in your reply must include the full query string**, including secondary references in tables, lists, and footnotes.

**Violation symptoms** (if you see these, immediately re-check § Quick Reference):
- Console: `TypeError: Failed to fetch` / `Cross-Origin Request Blocked`
- Page DOM looks normal but all `fetch` / `XMLHttpRequest` calls fail
- SSE / EventSource connection drops immediately
- `@edgeone/pages-blob` calls report `Missing: deployCredential` (even when the project is linked, because there is no HTTP context under file://)

#### ⛔ Self-hosted HTTP servers are strictly forbidden

`edgeone makers dev` **must NOT** be replaced by any of the following:
- `python -m http.server`
- `npx serve` / `npx http-server`
- A local service started with Node.js `http.createServer` / `express`

**Reason**: `edgeone makers dev` injects Blob credentials, emulates Cloud Functions routing, handles Edge Functions, and runs the middleware chain. A self-hosted server can only serve static files; its behavior diverges from production and produces mysterious "works locally, breaks on deploy" (or the reverse) issues.

---

### 10. Next.js HMR cross-origin configuration

The Next.js 15+ dev server trusts only `localhost` by default. Accessing it via `127.0.0.1` in the sandbox is treated as cross-origin, so the HMR WebSocket is blocked and the page becomes unresponsive.

**You MUST add to `next.config.js`**:
```javascript
allowedDevOrigins: ["127.0.0.1"]
```

Note: the value is a **bare host**, without an `http://` prefix and without a port.

---

### 11. Project linking (required for Blob/KV)

Projects that use Blob Storage or KV must ensure the project is linked (a `.edgeone/project.json` exists) before starting dev. When not linked, Blob/KV calls report `Missing: deployCredential`.

**Precondition — login first**: linking (and therefore Blob/KV) requires a logged-in account. The full chain is **Blob → must be linked → linking requires login**. If `edgeone whoami` returns exit 1, run `edgeone login` (browser) or use `edgeone makers link -t <token>` with a token **before** attempting to link. Do NOT try to link while unauthenticated.

**Detect whether it is linked**:
```bash
cat .edgeone/project.json 2>/dev/null && echo "LINKED" || echo "NOT LINKED"
```

**How to link**:

```bash
# Explicit link (auto-creates the project if it does not exist)
edgeone makers link --name <project-name> -t <token>

# Or implicitly link via the dev command
edgeone makers dev --name <project-name> --skip-env-sync
```

If the project named by `--name` does not exist remotely, the `link` command creates it automatically.

**Note**: even for a pure static project, if the code imports `@edgeone/pages-blob`, not linking will always cause an error.

---

### 12. Framework version requirements

| Framework/package | Minimum version | Reason |
|---------|---------|------|
| EdgeOne CLI | >= 1.6.7 | Non-interactive fixes, whoami fail-fast, --json support |
| Next.js | 16.x | The framework adapter tracks new versions |
| @edgeone/pages-blob | >= 0.0.14 | Older versions have known bugs |

Use `create-next-app@latest` rather than manually pinning an older version.

---

### 13. Native browser dialogs (`alert` / `confirm` / `prompt`) don't work in WorkBuddy's built-in browser

WorkBuddy's right-side preview panel does NOT render `window.alert()` / `window.confirm()` / `window.prompt()`. The call returns immediately without user interaction, so any handler gated on `if (confirm("Delete?"))` silently no-ops (a delete button appears to do nothing). The same page works fine in the user's real Chrome / Safari.

**Rule**: for any confirmation, prompt, or notification in the page, use an **in-page custom modal** (a `<div>` overlay with buttons wired via JS). Do NOT rely on the browser's built-in `alert` / `confirm` / `prompt` — the code looks correct in code review, works when the user opens the deployed URL in their own browser, and is silently broken in the WorkBuddy preview during dev/verification.
