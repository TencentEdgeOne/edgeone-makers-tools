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
  version: "1.4.2"
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
> - Desktop hosts can open the browser and route its callback; whether CLI or host owns that step depends on the actual configuration.
>
> Follow the shared makers-cli flow. Do not jump to token login just because the caller is an Agent, or retry browser authentication when the command only returned workspace choices.

---

### 1. Non-interactive mode (all CLI commands must avoid interactive prompts)

Inside the WorkBuddy sandbox, CLI interactive prompts cause the process to hang forever. All `edgeone` CLI commands must carry non-interactive flags:

| Scenario | Required flag | Reason |
|------|---------|------|
| Local development | `--skip-env-sync` | Skips the "sync environment variables?" confirmation |
| Linking a project | `--name <project>` + explicit link mode when supported | Confirm name/workspace and creation policy before changing association |
| Auth when not logged in | `--interaction agent` | Browser authentication with conversation workspace selection; use secure environment credentials for browserless CI |
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

Follow the shared [login, switching and target flow](../skills/edgeone-makers-tools/references/makers-cli.md). It supports standalone Skill execution via native CLI; MCP is optional, and no expert team is needed. Do not keep a separate login procedure in this environment guide.

- Desktop callers use agent interaction; the login listener remains alive until its final result. A pending workspace selection is not login completion. For an already authenticated account use `workspace use` to change workspace, not another login or account switch.
- Effective credentials may come from an explicit argument, environment, project local auth or global CLI state. Global switching does not overwrite a project-local credential; verify identity in the original project directory and obtain consent to correct the source without printing or deleting its contents.
- `--local` is opt-in additional credential persistence and may write global state too. It does not guarantee bypassing home write restrictions, and must not be the default response to sandbox errors.
- Use `whoami --json` after checking CLI `>= 1.7.0` and its JSON capability: true = authenticated, false = unauthed, null = verification unavailable. Missing JSON support on a reported matching version means checking the installed package/path, not a legacy fallback; exit 1 alone cannot distinguish auth from connectivity/file failures.
- On an approval-triggered re-run, a login result may already be consumed. Verify identity first; do not automatically replay it, switch commands to bypass policy, or restart browser authentication in a monolithic retry script.
- A pure-static preview can run without login if it needs no remote credentials. Pure local Blob persistence follows the storage/Agent reference; cloud-backed Blob/KV/Gateway access needs the appropriate target and credential. Deployment and binding must retain the original project ownership.

Use makers-cli's unified CLI `>= 1.7.0` execution baseline and feature capability checks. If the public release is unavailable or installed flags do not match, stop rather than falling back to an older CLI. Reading guidance or writing code does not require CLI installation.

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

File permissions depend on the actual host. A persistence denial can occur after a remote step or consumption of a one-use login result; it is not harmless proof of success. Keep the original error, inspect effective status, and use the shared approval/retry boundary rather than changing permissions or blindly rerunning authentication.

---

### 7. Command execution mode (sync vs async)

| Command | Execution mode | Reason |
|------|---------|------|
| `npm install` | **Foreground sync** | Usually 10-30s; running it in the background would leave later commands missing dependencies |
| `edgeone makers dev` | **Background async** (`run_in_background`) | Long-running process, must not block the conversation |
| `edgeone makers deploy` | Foreground with adequate timeout when supported; otherwise a host-managed background task | Wait for the original operation's final result. Background alone is not completion; do not start another deployment because output paused or the foreground budget expired. |

#### 7.2 Deploy in background — why, and what the kill really means

- Host wall-clock limits vary. Set adequate timeout for the actual tool; heartbeat output does not extend it. Do not infer success or a hang solely from output timing.
- If the CLI is killed after creating a deployment, the remote result is uncertain. Verify the original operation's status before a new attempt; re-running deploy is not a status query and can create another deployment.
- If the host requires a background task, retain its handle and await its completion notification. Do not treat a missing handle as completion, automatically relaunch the command, or end with a success claim before verified output.
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

Cloud-backed Blob/KV/Gateway access needs a verified directory association and credentials for its owning workspace. Read `.edgeone/project.json` as project metadata, then follow the shared makers-cli flow to verify identity and ownership. Mere file existence or SDK import does not prove a usable cloud binding; a pure local storage mode must not be forced to create a remote project.

- Existing association: preserve it; global switching does not migrate the target. If authentication is needed, authenticate the owning workspace, not an arbitrary default.
- Missing association: ask for the target workspace/name and existing/create policy. Use the shared explicit link modes and preserve local env; absent target does not authorize automatic creation.
- Unknown identity, unavailable project or failed ownership query: report the concrete failure, not a missing-login guess. Do not launch login solely because whoami exits 1.
- Cloud creation, changing the deployment target and pulling env each require the corresponding user authorization. Do not use dev --name, default auto linking, deleting project.json, or copying to a new directory as a workaround.

After verifying the target, start the original dev operation with env preservation. Truly local Blob persistence and static previews retain their independent no-cloud path; consult the relevant storage/Agent reference for the chosen mode.

---

### 12. Framework version requirements

| Framework/package | Minimum version | Reason |
|---------|---------|------|
| EdgeOne CLI (all commands, including anonymous deploy / claim) | >= 1.7.0 | Unified execution baseline; verify installed capabilities and public release availability via makers-cli before running commands |
| Next.js | 16.x | The framework adapter tracks new versions |
| @edgeone/pages-blob | >= 0.0.14 | Older versions have known bugs |

Use `create-next-app@latest` rather than manually pinning an older version.

---

### 13. Native browser dialogs (`alert` / `confirm` / `prompt`) don't work in WorkBuddy's built-in browser

WorkBuddy's right-side preview panel does NOT render `window.alert()` / `window.confirm()` / `window.prompt()`. The call returns immediately without user interaction, so any handler gated on `if (confirm("Delete?"))` silently no-ops (a delete button appears to do nothing). The same page works fine in the user's real Chrome / Safari.

**Rule**: for any confirmation, prompt, or notification in the page, use an **in-page custom modal** (a `<div>` overlay with buttons wired via JS). Do NOT rely on the browser's built-in `alert` / `confirm` / `prompt` — the code looks correct in code review, works when the user opens the deployed URL in their own browser, and is silently broken in the WorkBuddy preview during dev/verification.

### 14. Never hand the user a command to run

The user has **no terminal** in the WorkBuddy sandbox. Any command you print as an instruction is dead text — they cannot execute it, and a non-technical user cannot read it either.

| Situation | Do this | Not this |
|---|---|---|
| Anonymous project needs claiming | Run `edgeone login --claim --local --json` in the background and present its `claimLoginUrl` as a clickable link; the listener auto-links the project when the user finishes claiming | ❌ Printing `edgeone makers claim --sid <token>`, or presenting the bare `claimUrl` from the deploy JSON (the CLI never learns the login state) |
| The user needs to log in | Execute the shared makers-cli agent login flow after version/capability checks; no default local credential copy | ❌ Sending the user to a terminal or repeating a site-only/local login procedure |
| Something needs installing | Run it yourself in Bash | ❌ "Please run `npm install -g edgeone`" |

You are the one with shell access — use it. Only ask the user to type something when it genuinely cannot be automated (e.g. completing a login in the browser window you opened), and say plainly what you need from them.

### 14.1 Never let the key result get folded into a process message

WorkBuddy can collapse content emitted in the same message as a running or just-finished Bash command into a collapsible process entry. When the user asks to deploy, the deploy URL and claim link must never land there — if they do, the user sees nothing.

| Situation | Do this | Not this |
|---|---|---|
| A deploy just finished | Wait for the Bash call to fully return, then send the result (URL + claim link) **as its own message** | ❌ Emitting the result in the same message where the deploy ran, or attaching it to the command's stdout |
| Running a long command | Report progress only in later messages, after the tool call returns | ❌ Writing "here is your URL" inside the same turn as the command output |
