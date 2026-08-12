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
  Also trigger for login-free deployment and project claiming:
  "deploy without login", "no account yet", "anonymous deploy",
  "claim project", "claim my deployment",
  "免登录部署", "匿名部署", "还没有账号", "认领项目".
  ⚠️ Also trigger when any agent is about to execute `edgeone makers deploy` or `edgeone makers deploy`
  commands — the skill contains critical rules for parsing deploy output and presenting access URLs.
  Do NOT trigger for post-deployment runtime errors (e.g. CORS issues, 500 errors after deploy —
  use edgeone-makers-dev for troubleshooting).
metadata:
  author: edgeone
  version: "2.6.1"
---

# EdgeOne Makers Deployment Skill

Deploy any project to **EdgeOne Makers**.

## ⛔ Critical Rules (never skip)

1. **CLI version ≥ `1.6.0`** — reinstall if lower. Versions below `1.6.0` lack the non-interactive fixes (whoami fail-fast, `--json` output) and hang in Agent/CI environments. Never proceed with an outdated version. **Anonymous deploy and `claim` additionally require `1.6.21`** — that is a higher, feature-specific floor; see **Anonymous Deploy**. Do not block a normal authenticated deploy because the CLI is below `1.6.21`.
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
3b. **Use `edgeone whoami` to check login status** — `whoami` fails fast (exit 1) when not logged in instead of hanging. If it exits 0, the user is already logged in and `-t` is not needed. **Do NOT** check `cat .edgeone/.token` — CLI stores credentials in `~/.edgeone/<hash>` files, not a fixed `.token` path.
4. **⚠️ The deploy URL MUST be placed prominently at the very top of your reply** — once deployment finishes, the complete access URL is the core deliverable the user cares about most. You MUST: ① place it on the first line or in the first standalone block of your reply body; ② use a prominent format (e.g. a large heading + code block); ③ never bury the URL in the middle of a long paragraph where the user has to hunt for it. Example format:
   ```
   🌐 Live URL: https://my-project-abc123.edgeone.cool?<auth_query_params>
   ```
   Then append any other notes (console URL, caveats, etc.).
5. **Ask the user to choose China or Global site** before browser login. Never assume. (Token login via `edgeone login --token` auto-detects site, no need to ask.)
6. **Auto-detect the login method** — browser login in desktop environments, token login in headless/remote/CI environments. Follow the decision table below.
7. **After token login, ask if the user wants to save the token locally** for future use.
8. **Before triggering any browser popup (login / registration), explain the reason and the benefits to the user first** — never silently launch a browser window.

**Rules 9-12 apply to the anonymous deploy / claim flow only:**

9. **The claim command's parameter is `--sid`, NOT `--token`** — `edgeone makers claim --sid <anonymous-token>`. The `-t` / `--token` flag on `claim` is the **account API token**, an entirely different credential. Passing the anonymous token to `-t` fails. Product documentation showing `claim --token <anonymous-token>` is wrong; trust this rule.
10. **Tell the user to claim within 60 minutes** — say exactly that: "claim within 60 minutes". Do not show the raw `expiresAt` timestamp to the user, and do not compute or invent a different duration from it. 60 minutes is the product's stated claim window and the conservative instruction: claiming early is always safe, so this is the wording to use even though the token's observed lifetime can be longer.
11. **Point the user at the claim link — nothing else** — do not print `claimCommand`, `edgeone makers claim --sid ...`, or any other command as the user's way to claim. In sandboxed IDEs like WorkBuddy the user has no terminal and literally cannot run it, and non-technical users cannot read it. Give them the **`claimUrl` link** and stop there: do not offer to claim on their behalf either — signing in on the claim page *is* the flow, and an extra option only adds a decision. Run `claim` yourself only if the user explicitly asks you to.
12. **Keep the claim pitch minimal — do not over-promise, and do not teach domains** — say only that signing in *keeps* the project. ❌ Never write "permanently yours", "no time limit or access restrictions", "unlimited", or anything implying the URL then works unconditionally forever: a claimed project may still need a custom domain, and mainland-China access can require ICP filing, so those claims are false. ❌ Also do not volunteer custom domains, ICP filing, DNS, or console navigation while the user is just deciding whether to claim — that front-loads complexity onto someone who only wanted a live URL. The claim page owns the follow-up flow. Answer such topics only when the user asks.

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

# Check 1: CLI installed and correct version? (must be >= 1.6.0; anonymous deploy needs >= 1.6.21)
edgeone -v

# Check 2: Already logged in? (whoami fails fast, won't hang)
edgeone whoami
# If exit 0 → logged in, no -t needed
# If exit 1 → not logged in, need token or browser login

# Check 3: Project already linked?
cat edgeone.json 2>/dev/null
```

### Decision Table

| CLI version | Login status | Action |
|-------------|-------------|--------|
| Not installed or < 1.6.0 | — | → Go to **Install CLI** |
| `≥ 1.6.0` ✓ | Logged in (or token present) | → Go to **Deploy** |
| `≥ 1.6.0` ✓ | Not logged in, has saved token | → Go to **Deploy with Token** (use saved token) |
| `≥ 1.6.21` ✓ | Not logged in, no saved token, **interactive** | → Go to **Anonymous Deploy** — ask the user to choose anonymous deploy or login |
| `≥ 1.6.21` ✓ | Not logged in, no saved token, **non-interactive (Agent/CI/headless)** | → Go to **Anonymous Deploy**; when the user cannot be asked, deploy with `--anonymous --json` and surface the claim link and the 60-minute claim window in the result |
| `1.6.0`–`1.6.20` | Not logged in, no saved token | Anonymous deploy is unavailable on this version → Go to **Login**, or ask the user for a token |

---

## Install CLI

```bash
npm install -g edgeone@latest
```

Verify: `edgeone -v` — confirm output is `1.6.0` or higher. Retry installation if not. (Versions < 1.6.0 hang on `whoami`/login in non-interactive environments and lack `--json`.) Anonymous deploy and `claim` need `1.6.21`; if `latest` is still below that, those two features are simply unavailable — normal authenticated deploy works fine.

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

If the user does not respond for an extended period (e.g., more than 1–2 minutes), **proactively ask** about their status (whether the browser opened, any errors, or if they want to switch to Token login). Do not wait indefinitely.

### 1. Ask the user to choose a site, then ALWAYS pass `--site`

Use the IDE's selection control (`ask_followup_question`) before running any login command:

> Choose your EdgeOne Makers site:
> - **China** — For users in mainland China (console.cloud.tencent.com)
> - **Global** — For users outside China (console.intl.cloud.tencent.com)

⚠️ **CRITICAL**: After the user chooses, you MUST invoke login with an explicit
`--site <china|global>` flag (e.g. `edgeone login --site china`).
**NEVER run a bare `edgeone login` (without `--site`) when driven by an Agent / skill.**
A bare `login` in a non-interactive context fails fast asking for
`--site` (it no longer pops an interactive site-picker that would hang). The site choice
is meant to happen here in the conversation, not inside the CLI.

### 2. Detect environment and choose login method

| Condition | Method |
|-----------|--------|
| Local desktop IDE (VS Code, Cursor, WorkBuddy, etc.) | **Browser Login** |
| Remote / SSH / container / CI / cloud IDE / headless | **Token Login** |
| User explicitly requests token | **Token Login** |

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

## Anonymous Deploy (no login required)

When the user is not logged in and has no token, they can deploy anonymously and claim the project later. Requires CLI `>= 1.6.21`. On `1.6.0`–`1.6.20` this feature does not exist — use **Login** or a token instead.

### Step 1: Exclusion check — run this FIRST

Anonymous deploy builds with an empty environment: it skips remote env-var pull and AI-gateway credential injection, because both need authentication. Projects depending on either will deploy successfully but break at runtime.

```bash
# Is this an Agent project?
ls agents/ 2>/dev/null && echo "AGENT_PROJECT"

# Does it use Blob storage? (checks source files and the dependency declaration)
grep -rEl "@edgeone/pages-blob" \
  --include="*.ts" --include="*.js" --include="*.mjs" --include="*.cjs" \
  --include="*.tsx" --include="*.jsx" --include="*.vue" --include="*.svelte" \
  . 2>/dev/null | head -1
grep -l '"@edgeone/pages-blob"' package.json 2>/dev/null
```

Non-empty output from either grep means the project uses Blob.

**KV cannot be detected this way — you must ask.** A KV namespace is bound in the console and exposed as a *global variable* whose name the user chose (e.g. `my_kv`), so there is no package import to grep for. There is no `@edgeone/pages-kv` package. Ask the user directly:

> Does this project use KV storage?

If either check hits, or the user says the project uses KV, **do not deploy anonymously.** Go to **Login** and tell the user why:

> This project needs environment variables / AI gateway credentials or a storage binding, which anonymous deploy cannot provide. The site would load but those features would fail. Let's log in so it works properly.

Plain static sites and frontend-framework projects with no such dependency may proceed.

If the user acknowledges the limitation and still wants an anonymous deploy, you may proceed — but state prominently in your result that AI and storage features will not work until the project is claimed and configured.

### Step 2: Ask the user — do not deploy anonymously without asking

In an interactive environment, present the choice (use the IDE's selection control, e.g. `ask_followup_question`):

> You're not logged in to EdgeOne Makers. Two options:
> - **Deploy anonymously (no login)** — you get a working URL immediately. You'll need to log in and claim the project **within 60 minutes**, or it is removed. Until claimed, the link has visitor-count and IP restrictions, so it isn't suitable for wide sharing.
> - **Log in now** — the project is saved to your account right away, with no claim deadline.

⛔ **Do not over-promise what claiming gives them.** Say the project is *kept* / *saved to their account*, and nothing more. Specifically, do **not** say "no access restrictions", "permanently yours", or anything implying the URL is then unconditionally public and final — a claimed project can still need a custom domain and, for mainland-China access, ICP filing. Do **not** raise custom domains, ICP filing, or DNS at this point either: the user is deciding whether to log in, and those concepts are noise here. The claim page walks them through next steps.

Only skip this question when the environment genuinely cannot ask (CI, headless, no TTY). In that case deploy anonymously and make the claim link and the 60-minute window unmissable in your result — the user had no chance to be warned in advance.

### Step 3: Deploy

```bash
export PAGES_SOURCE=skills
edgeone makers deploy --anonymous --json
```

Add `--site china` or `--site global` only when the site must be pinned (the user told you which, or CI needs determinism). Otherwise omit it — **the CLI detects the site itself** from its own egress IP. Do not probe for the site yourself and do not synthesise `--site` from your own check.

Do **not** pass `-n`, `-e`, or `--area` — they are ignored under `--anonymous`. The project name is generated automatically.

### Step 4: Present the result — all three parts are mandatory

Parse the **last line** of stdout as JSON (human-readable output precedes it). Fields are **camelCase**: `url`, `projectId`, `deploymentId`, `anonymousToken`, `claimUrl`, `claimCommand`, `expiresAt`, `site`.

Your reply must contain all three of the following. The URL alone is not enough — an unclaimed project disappears.

1. **The full access URL**, at the very top, complete with any query string (critical rules 2 and 4 apply exactly as for a normal deploy).
2. **The claim link** — `claimUrl`, as a clickable link. ⛔ **Do NOT show `claimCommand` or any `edgeone makers claim ...` command to the user.** See critical rule 11.
3. **"Claim within 60 minutes"**, plus that the project is removed if not claimed. Use that wording verbatim — do not show the raw `expiresAt` timestamp and do not substitute a different duration. See critical rule 10.

Example shape:

> 🌐 **Live URL**: `<url>`
>
> ---
>
> ⏳ **Claim within 60 minutes** — otherwise this project is removed.
>
> 👉 [Claim this project](<claimUrl>) — sign in to keep it.

Keep it to that. The claim link is the whole call to action: do not also offer to claim on their behalf, do not append what claiming "unlocks", and do not introduce custom domains, ICP filing, or DNS here — the claim page guides them from there. See critical rules 11 and 12.

### Claiming a project

**The default is that the user claims it themselves via `claimUrl`** — that is what you present, and you do not offer an alternative. This command is a fallback for when the user explicitly asks you to claim it for them. Never print it for the user.

Requires login. Run from the directory containing `.edgeone/anonymous.json` and the token is picked up automatically:

```bash
edgeone makers claim --json
# or pass the token explicitly:
edgeone makers claim --sid <anonymousToken> --json
```

⛔ The parameter is `--sid` (see critical rule 9). `-t` on `claim` is the account API token, not the anonymous token.

Claim only after the deploy has finished — the backend only migrates deployments in `Success` state. On success the local state file is deleted and the project becomes a normal one, managed with `edgeone makers deploy`.

Report the outcome in plain language — the project name and its live URL — not the raw JSON. Confirm it is saved to their account and stop there; do not add what they "can now do" (see critical rule 12).

For the full JSON schema, rate limits, error codes, state-file fields, and site-resolution rules, see [references/anonymous-deploy.md](references/anonymous-deploy.md).

---

## ⚠️ Parse Deploy Output (Critical)

### Preferred: `--json`

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

**Show the user — the deploy URL MUST be placed at the very top of your reply, in the most prominent position:**

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
| `--anonymous` / `claim` reported as an unknown option | The installed CLI is below `1.6.21`. Run `npm install -g edgeone@latest`; if that is still below `1.6.21`, anonymous deploy is not released yet — use login or a token instead |
| Browser does not open during login | Switch to token login |
| "not authenticated" / exit 1 from `whoami` | Expected when not logged in — whoami fails fast instead of hanging. Offer anonymous deploy (see Anonymous Deploy), run `edgeone login`, or provide a token |
| Non-interactive deploy says "browser login is unavailable" + exits 1 | Expected fail-fast in Agent/CI/headless with no token. Provide a token via `-t <token>` or set `EDGEONE_PAGES_API_TOKEN` |
| Deploy seems to hang at `[DeployStatus] Deploying...` | Non-TTY emits heartbeat lines; it is NOT stuck. If a wrapper still mis-detects, use `--json` or run in background and poll. Do not kill it |
| Auth error with token | Token may be expired — regenerate at the console |
| Login appears successful but `deploy` reports auth error | Browser reused a session from the wrong site, binding the wrong account. Click "Sign in with a different account" on the login page, or log out from all Tencent Cloud consoles first |
| `edgeone whoami` shows an unexpected account | Browser session reuse. Click "Sign in with a different account" or log out from all consoles and re-login |
| Project name conflict | Use a different name with `-n` |
| Build failure | Check logs — usually missing deps or bad build script |

---

For CLI command reference, environment variables, local dev setup, and token management details, see [references/command-reference.md](references/command-reference.md).
