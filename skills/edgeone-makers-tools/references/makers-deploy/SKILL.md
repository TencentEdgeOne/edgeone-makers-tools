---
name: edgeone-makers-deploy
description: >-
  This skill deploys frontend and full-stack projects to EdgeOne Makers (Tencent EdgeOne).
  Trigger this skill whenever deployment is part of the task — whether as the primary intent
  or a secondary step. Examples: "deploy my app", "publish this site", "push this live",
  "create a preview deployment", "deploy to EdgeOne", "ship to production",
  "go live", "release", "publish a new version", "redeploy",
  "上线", "发布", "发一版", "重新部署",
  "搭建并部署", "开发并上线", "build and deploy", "create and deploy".
  ⚠️ Also trigger when any agent is about to execute `edgeone makers deploy` or `edgeone makers deploy`
  commands — the skill contains critical rules for parsing deploy output and presenting access URLs.
  Do NOT trigger for post-deployment runtime errors (e.g. CORS issues, 500 errors after deploy —
  use edgeone-makers-dev for troubleshooting).
metadata:
  author: edgeone
  version: "2.2.0"
---

# EdgeOne Makers Deployment Skill

Deploy any project to **EdgeOne Makers**.

## ⛔ Critical Rules (never skip)

1. **CLI version ≥ `1.6.0`** — reinstall if lower. Versions below `1.6.0` lack the non-interactive fixes (whoami fail-fast, `--json` output) and will hang in Agent/CI environments. Never proceed with an outdated version.
2. **Never truncate the deploy URL — this applies to EVERY mention** — `EDGEONE_DEPLOY_URL` includes query parameters (`?eo_token=...&eo_time=...`) required for access. Without them the page returns 401. Always output the **complete** URL with full query string. This rule applies to: the primary display, summary tables, footnotes, comparisons, code blocks, `present_files` calls — **every single occurrence** of the URL in your reply. Truncation is any removal of the `?` and everything after it.

   ❌ WRONG (truncated — will 401):
   ```
   https://my-app-w9t0lxe8.edgeone.cool
   ```

   ✅ CORRECT (full URL):
   ```
   https://my-app-w9t0lxe8.edgeone.cool?eo_token=abc123&eo_time=1234567890
   ```

   **Self-check after writing your reply**: scan for every instance of the `.edgeone.cool` domain. Does each one include `?eo_token=`? If any doesn't, fix it NOW — the user will get a 401.
3a. **Prefer `--json` when running non-interactively** — in Agent/CI/headless contexts, always pass `--json` to `deploy` so the result is a single machine-readable line; no need to scrape colored/`\r`-animated stdout. See **Parse Deploy Output**.
3b. **Use `edgeone whoami` to check login status** — on CLI ≥ 1.6.0, `whoami` fails fast (exit 1) when not logged in instead of hanging. If it exits 0, the user is already logged in and `-t` is not needed. **Do NOT** check `cat .edgeone/.token` — CLI stores credentials in `~/.edgeone/<hash>` files, not a fixed `.token` path.
4. **The deploy URL MUST appear in the user-visible reply body, in a prominent format (own line, code block, or heading — not inline).** Thinking / reasoning / "深度思考" blocks are hidden by default; a URL placed only there does not count as shown. Complete URL, no truncation (Rule 2). Example format:
   ```
   🌐 Live URL: https://my-project-abc123.edgeone.cool?<auth_query_params>
   ```
   Then append any other notes (console URL, caveats, etc.).
5. **Ask the user to choose China or Global site** before browser login. Never assume. (Token login via `edgeone login --token` auto-detects site, no need to ask.)
6. **Prefer Browser Login; fall back to Token only after browser login is confirmed to fail** (see Login section for the ~60s fallback threshold and the Agent-in-IDE clarification — WorkBuddy is NOT headless). Token-first only when the user explicitly requests it.
7. **After token login, ask if the user wants to save the token locally** for future use.
8. **Before triggering any browser popup (login / registration), explain the reason and the benefits to the user first** — never silently launch a browser window.
9. **On any CLI failure, surface the actual error text to the user before retrying, switching commands, or proposing a workaround.** Do NOT paraphrase (e.g. don't rewrite `Makers project exceeds 40 limit` into "maybe a name conflict or permission"). Do NOT silently pivot from `makers dev` to `makers deploy` (or vice versa) hoping to bypass — a systemic failure (auth / quota / permission) hits both with the same cause. Quote the raw error, name the root cause, then propose the fix or ask the user.

---

## Environment Setup

Before executing **any** `edgeone` CLI command (install, login, deploy, etc.), set the following environment variable in the current shell session:

```bash
export PAGES_SOURCE=skills
```

Or prefix each command inline:

```bash
PAGES_SOURCE=skills edgeone makers deploy
```

This tells the platform that the deployment is triggered from an AI skill context.

---

## Deployment Flow

Run these checks first, then follow the decision table:

```bash
# Check 0: Set environment variable (required before any edgeone command)
export PAGES_SOURCE=skills

# Check 1: CLI installed and correct version? (must be >= 1.6.0)
edgeone -v

# Check 2: Already logged in? (CLI >= 1.6.0 whoami fails fast, won't hang)
edgeone whoami
# If exit 0 → logged in, no -t needed
# If exit 1 → not logged in, need token or browser login

# NOTE: This auth gate is for `deploy` (account-bound upload to your EdgeOne
# account). For `edgeone makers dev` (local preview), login is ONLY required
# when the project uses Blob/credentialed backends — a pure-static dev needs
# no login. When Blob IS used, the chain is: Blob → must be linked → linking
# requires login, so login before linking/starting dev. See makers-storage /
# makers-env-adaption for the dev auth rule and the link chain.

# Check 3: Project already linked?
cat edgeone.json 2>/dev/null
```

### Decision Table

| CLI version | Login status | Action |
|-------------|-------------|--------|
| Not installed or < 1.6.0 | — | → Go to **Install CLI** |
| `≥ 1.6.0` ✓ | Logged in (or token present) | → Go to **Deploy** |
| `≥ 1.6.0` ✓ | Not logged in, has saved token | → Go to **Deploy with Token** (use saved token) |
| `≥ 1.6.0` ✓ | Not logged in, no saved token | → **Try Browser Login first** (see Login section). If the browser doesn't open or nothing happens within ~60 seconds, **fall back to Token Login**. Do NOT preemptively skip browser login by guessing "this looks like an Agent/CI environment" — that guess is often wrong. In particular, **WorkBuddy is a desktop IDE sandbox and fully supports browser login** (host browser + OAuth callback are bridged into the sandbox). |
| `≥ 1.6.0` ✓ | User explicitly provides a token or requests token login | → Go to **Deploy with Token** / **Token Login** |

---

## Install CLI

```bash
npm install -g edgeone@latest
```

Verify: `edgeone -v` — confirm output is `1.6.0` or higher. Retry installation if not. (Versions < 1.6.0 hang on `whoami`/login in non-interactive environments and lack `--json`.)

---

## Login

### 0. Explain the registration/login step

Before triggering any login flow, explain to the user **why** this step is needed and **what** to expect. Do not silently launch a browser window.

Tell the user:

> You need to log in or register an EdgeOne Makers account. Here's what to expect:
> - **Why login is required**: Deployment uploads your build output to your own account, generating a unique access URL and project record.
> - **What you get for free**: EdgeOne Makers offers a free tier with global CDN acceleration, automatic HTTPS, and custom domain binding — typically more than enough for personal projects.
> - **What happens next**: I'll run `edgeone login`, and your default browser will open the Tencent Cloud login page. Please complete the login/registration and authorize access, then come back here.
> - **If you get stuck**: If the browser doesn't open, or the CLI keeps waiting after you've logged in, let me know — I'll switch to Token login instead.

If the user does not respond within ~60 seconds (no browser popup or no progress reported), **proactively ask** about their status (whether the browser opened, any errors, or if they want to switch to Token login). Do not wait indefinitely.

### 1. Ask the user to choose a site, then ALWAYS pass `--site`

Use the IDE's selection control (`ask_followup_question`) before running any login command:

> Choose your EdgeOne Makers site:
> - **China** — For users in mainland China (console.cloud.tencent.com)
> - **Global** — For users outside China (console.intl.cloud.tencent.com)

⚠️ **CRITICAL**: After the user chooses, you MUST invoke login with an explicit
`--site <china|global>` flag (e.g. `edgeone login --site china`).
**NEVER run a bare `edgeone login` (without `--site`) when driven by an Agent / skill.**
On CLI ≥ 1.6.0, a bare `login` in a non-interactive context fails fast asking for
`--site` (it no longer pops an interactive site-picker that would hang). The site choice
is meant to happen here in the conversation, not inside the CLI.

### 2. Login methods reference

Two login methods are available. **Per Rule 6, always try Browser Login first**; the table below is a reference for when each method applies, not a decision procedure — do not use it to guess the environment.

| Method | When it applies |
|--------|-----------------|
| **Browser Login** | Default. Works in all local desktop IDEs (VS Code, Cursor, WorkBuddy) — the IDE bridges the OS browser + OAuth callback into the sandbox. |
| **Token Login** | Fallback after Browser Login is confirmed to fail (no browser popup / no progress within ~60s), OR when the user explicitly provides a token or requests token login. Also the only option in truly detached environments (SSH-only, CI runners, browserless containers). |

#### Browser Login

```bash
# China site
edgeone login --site china

# Global site
edgeone login --site global
```

Wait for the user to complete browser auth. The CLI prints a success message when done.

⚠️ **Browser Session Reuse Trap**: If the user previously logged into a **different site** (e.g., logged into Global site before, now trying China site, or vice versa), the browser may **silently reuse the old Tencent Cloud session**. The CLI will appear to succeed, but actually binds to the wrong account — subsequent `deploy` will fail with auth errors or `whoami` shows an unexpected account.

If this happens, guide the user to:
1. Click "**Sign in with a different account**" on the login page; or
2. Log out from **all Tencent Cloud consoles** (both `console.cloud.tencent.com` and `console.intl.cloud.tencent.com`) first, then re-run `edgeone login`.

#### Token Login

Two methods available:

**Method A: `edgeone login --token` (persistent, recommended)**

```bash
edgeone login --token <token>
```

Auto-detects china/global from the token — no `--site` flag needed. Persists login state for subsequent commands.

> 💡 **Reuse the token from a prior browser login — no console trip needed.** `edgeone login --site <x>` (browser) auto-generates an API Token and writes it to `~/.edgeone/<hash>` (JSON with `value.Token`). You can reuse that `Token` value directly as `EDGEONE_PAGES_API_TOKEN="<Token>"` or `-t <Token>` for `makers dev`/`deploy` in headless/agent contexts, instead of creating a new token in the console.

**Method B: Pass `-t` directly in deploy (per-invocation)**

Token is used for that single deploy only; no persistent login state is saved.

```bash
edgeone makers deploy -t <token>
```

⚠️ **Important**: `edgeone whoami` does NOT support a `-t` flag. Do NOT attempt to verify a token with `whoami -t <token>`. When the user provides a token, skip login checks entirely and go straight to deploy.

Guide the user to obtain a token:
1. Go to the console:
   - **China**: https://console.cloud.tencent.com/edgeone/pages?tab=settings
   - **Global**: https://console.intl.cloud.tencent.com/edgeone/pages?tab=settings
2. Find **API Token** → **Create Token** → Copy it

⚠️ Remind the user: the token has account-level permissions. Never commit it to a repository.

### 3. Offer to save the token locally

After the user provides a token, ask:

> Save this token locally for future deployments?
> - **Yes** — Save to `.edgeone/.token` (auto-used next time)
> - **No** — Use for this deployment only

**If Yes:**

```bash
mkdir -p .edgeone
echo "<token>" > .edgeone/.token
grep -q '.edgeone/.token' .gitignore 2>/dev/null || echo '.edgeone/.token' >> .gitignore
```

Confirm to the user: "✅ Token saved to `.edgeone/.token` and added to `.gitignore`."

---

## Deploy

### Browser-authenticated deploy (Makers projects)

```bash
# Project already linked (edgeone.json exists)
edgeone makers deploy

# New project (no edgeone.json)
edgeone makers deploy -n <project-name>
```

`<project-name>`: auto-generate from the project directory name. The first deploy creates `edgeone.json` automatically.

### Token-based deploy (Makers projects)

First check for a saved token:

```bash
cat .edgeone/.token 2>/dev/null
```

- Saved token found → use it, tell the user: "Using saved token from `.edgeone/.token`"
- No saved token → ask the user to provide one (see Token Login above)

```bash
# Project already linked
edgeone makers deploy -t <token>

# New project
edgeone makers deploy -n <project-name> -t <token>
```

The token already contains site info — no `--site` flag needed.

After a successful deploy with a manually-entered token, ask if the user wants to save it (see "Offer to save the token locally" above).

### Deploy to preview environment

```bash
edgeone makers deploy -e preview
```

### Non-interactive / Agent / CI deploy (recommended: `--json`)

When running inside an Agent, CI, or any non-TTY context, **add `--json`** so the final
result is emitted as a single machine-readable line — no scraping of colored stdout:

```bash
edgeone makers deploy -n <project-name> --json
edgeone makers deploy -n <project-name> -t <token> --json
```

### Makers Agent Projects deploy

For projects with `agents/` directory (AI Agent projects), use `edgeone makers deploy` which auto-runs build:

```bash
edgeone makers deploy -n <name> -t <token> --json
edgeone makers deploy -n <name> -t <token> --json -e preview
```

Note: `edgeone makers deploy` automatically runs build before deploying — no separate `edgeone makers build` step needed.

### Build behavior

The CLI auto-detects the framework, runs the build, and uploads the output directory. No manual config needed.

---

## ⚠️ Parse Deploy Output (Critical)

### Preferred: `--json` (CLI ≥ 1.6.0)

When deploy is run with `--json`, the **last line** of stdout is a single JSON object —
parse that directly, no regex / ANSI cleanup needed:

```json
{"status":"success","url":"https://my-project-abc123.edgeone.cool?<auth_query_params>","type":"preset","projectId":"makers-xxxxxxxx","deploymentId":"dp-xxxx","consoleUrl":"https://console.cloud.tencent.com/edgeone/pages/project/makers-xxxxxxxx/deployment/xxxxxxx"}
```

On failure the last line is `{"status":"error","error":"<message>"}` and the process exits non-zero.

Use `url` (full, with query string), `projectId`, and `consoleUrl` directly.

### Fallback: text output (no `--json`)

After `edgeone makers deploy` succeeds, the CLI outputs:

```
[cli][✔] Deploy Success
EDGEONE_DEPLOY_URL=https://my-project-abc123.edgeone.cool?<auth_query_params>
EDGEONE_DEPLOY_TYPE=preset
EDGEONE_PROJECT_ID=makers-xxxxxxxx
[cli][✔] You can view your deployment in the EdgeOne Makers Console at:
https://console.cloud.tencent.com/edgeone/pages/project/pages-xxxxxxxx/deployment/xxxxxxx
```

**Extraction rules:**

| Field | How to extract | ⛔ Warning |
|-------|---------------|-----------|
| **Access URL** | Full value after `EDGEONE_DEPLOY_URL=` | **Include the full query string** (`?` and everything after) — without these params the page will not load |
| **Project ID** | Value after `EDGEONE_PROJECT_ID=` | — |
| **Console URL** | Line after "You can view your deployment..." | — |

**Show the user — the deploy URL MUST appear in the visible reply body, formatted prominently:**

⚠️ **URL Integrity Rules (read before composing your reply):**

| Rule | Detail |
|------|--------|
| **Every mention must be complete** | If you write the URL in a table, a list, a footnote, a comparison, or any secondary location — it MUST still include the full query string. No exceptions. |
| **No visual "cleanup"** | Do not shorten the URL to make a table look nicer. A truncated URL is broken, not clean. |
| **Concrete, not abstract** | Use the actual URL from deploy output. Do not replace query params with `...` or `(params omitted)` or any placeholder in user-facing text. |
| **Self-check before sending** | Search your draft for `.edgeone.cool` — every hit must have `?eo_token=`. |

> 🌐 **Live URL**: `https://my-project-abc123.edgeone.cool?eo_token=abc123&eo_time=1234567890`
>
> ---
>
> - **Console URL**: `https://console.cloud.tencent.com/edgeone/pages/project/...`
>
> ℹ️ Note: This preview URL is for quick deployment verification. When accessed from mainland China, the link may become restricted (e.g., 401) after some time or when shared, due to domain ICP filing status or CDN acceleration policies. For long-term stable public access, bind a custom domain with proper ICP filing.

---

## Error Handling

| Error | Solution |
|-------|----------|
| `command not found: edgeone` | Run `npm install -g edgeone@latest` |
| CLI version < 1.6.0 | Reinstall: `npm install -g edgeone@latest`. Older versions hang on whoami/login in non-interactive contexts |
| Browser does not open during login | Switch to token login |
| "not authenticated" / exit 1 from `whoami` (CLI ≥ 1.6.0) | Expected when not logged in — whoami now fails fast instead of hanging. Run `edgeone login` (desktop) or provide a token |
| Non-interactive deploy says "browser login is unavailable" + exits 1 | Expected fail-fast in Agent/CI/headless with no token. Provide a token via `-t <token>` or set `EDGEONE_PAGES_API_TOKEN` |
| Deploy seems to hang at `[DeployStatus] Deploying...` | On CLI ≥ 1.6.0 non-TTY emits heartbeat lines; it is NOT stuck. If a wrapper still mis-detects, use `--json` or run in background and poll. Do not kill it |
| Auth error with token | Token may be expired — regenerate at the console |
| Login appears successful but `deploy` reports auth error | Browser reused a session from the wrong site, binding the wrong account. Click "Sign in with a different account" on the login page, or log out from all Tencent Cloud consoles first |
| `edgeone whoami` shows an unexpected account | Browser session reuse. Click "Sign in with a different account" or log out from all consoles and re-login |
| `Failed to create pages project` (dev) / `Makers project exceeds 40 limit` (deploy) | Account has hit the **40-project cap**. Both `makers dev` (creates a project for local preview) and `makers deploy` (creates for upload) fail with the same cause — retrying the other command does NOT bypass it. Tell the user immediately. Two ways to unblock: ① delete unused projects in the EdgeOne console to free a slot; ② deploy into an existing linked project via `-n <existing-project-name>` (skip the "create new" path). |
| Project name conflict | Use a different name with `-n` |
| Build failure | Check logs — usually missing deps or bad build script |
| `whoami` says "not authenticated" but `edgeone login` just succeeded | Expected in agent/headless: `whoami` and `makers dev`/`deploy` read API-Token auth, not the browser session. Reuse the auto-generated token from `~/.edgeone/<hash>` (`value.Token`) as `EDGEONE_PAGES_API_TOKEN` / `-t`. See Token Login note above. |
| `makers dev` hangs on an interactive "Link existing / Create and link" menu | The dev server needs project linking, which prompts interactively (blocks headless). Skip dev and go straight to `edgeone makers deploy -n <name> -t <token> --json`, which auto-creates + links non-interactively. |
| `curl` to the deploy URL returns 302 → DingTalk SSO login | Preview gateway requires browser-based `eo_token` validation (JS), which `curl` can't do. Open the full `?eo_token=...&eo_time=...` URL in a real browser — it validates the token and bypasses SSO. Not a code bug. |

---

For CLI command reference, environment variables, local dev setup, and token management details, see [references/command-reference.md](references/command-reference.md).
