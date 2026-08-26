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
pathPatterns:
  - "*.sh"
  - .github/workflows/**
validate:
  - pattern: "whoami[^\\n]*\\s-t\\s"
    message: "edgeone whoami does not accept -t. Check the exit code instead: 0 = logged in, 1 = not."
metadata:
  author: edgeone
  version: "2.11.0"
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
3b. **Use `edgeone whoami` to check login status** — on CLI ≥ 1.6.0, `whoami` fails fast (exit 1) when not logged in instead of hanging. If it exits 0, the user is already logged in and `-t` is not needed. **Do NOT** check `cat .edgeone/.token` — CLI stores credentials in `~/.edgeone/<hash>` files, not a fixed `.token` path.
4. **The deploy URL MUST be placed at the very top of the visible reply body (own line, code block, or heading — not inline, not mid-reply), AND ALSO pinned via `present_files` (or the IDE's preview tool) to the side panel.** Two UI failures to survive: thinking / reasoning / "深度思考" blocks hide content by default; long replies get auto-folded by IDE chat cards, burying anything placed mid-reply. `present_files` is unaffected by chat folding — that's the second, always-visible channel. Complete URL, no truncation (Rule 2). Example format:
   ```
   🌐 Live URL: https://my-project-abc123.edgeone.cool?<auth_query_params>
   ```
   Then append any other notes (console URL, caveats, etc.).

   **Self-check before ending the turn (MANDATORY)** — read back what the user will actually SEE (NOT your thinking / reasoning content). Two questions: (a) Is the complete `.edgeone.cool` URL present at the top of the visible reply, in a code block or heading? (b) Was `present_files` called with that URL? If either answer is no, send an **additional short message** containing ONLY the `🌐 Live URL: <full URL>` block and call `present_files`. Do not end the turn until both channels carry the URL. "I already mentioned it in my reasoning" is NOT a substitute for placing it in the visible body.
5. **Ask the user to choose China or Global site** before browser login. Never assume. (Token login via `edgeone login --token` auto-detects site, no need to ask.)
6. **Prefer Browser Login; fall back to Token only after browser login is confirmed to fail** (see Login section for the ~60s fallback threshold and the Agent-in-IDE clarification — WorkBuddy is NOT headless). Token-first only when the user explicitly requests it.
7. **After token login, ask if the user wants to save the token locally** for future use.
8. **Before triggering any browser popup (login / registration), explain the reason and the benefits to the user first** — never silently launch a browser window.
9. **On any CLI failure, surface the actual error text to the user before retrying, switching commands, or proposing a workaround.** Do NOT paraphrase (e.g. don't rewrite `Makers project exceeds 40 limit` into "maybe a name conflict or permission"). Do NOT silently pivot from `makers dev` to `makers deploy` (or vice versa) hoping to bypass — a systemic failure (auth / quota / permission) hits both with the same cause. Quote the raw error, name the root cause, then propose the fix or ask the user.
10. **Write every user-facing message in the user's own language** — **all** prose, blockquotes, and prompts in this skill are written in English purely to specify *meaning*; none of it is a string to paste. If the user writes to you in Chinese, speak Chinese — the login explanation, the site choice, the token question, the deploy result, all of it. Likewise for any other language. Emitting this skill's English strings into a non-English conversation is a bug. Only literal CLI commands, flags, env var names, and JSON field names stay verbatim. ⚠️ Where this skill gives a **fixed template** (Steps 2 and 4 of Anonymous Deploy), translating it is required but rewriting or extending it is not allowed — match it line for line.

**Rules 11-14 apply to the anonymous deploy / claim flow only:**

11. **The claim command's parameter is `--sid`, NOT `--token`** — `edgeone makers claim --sid <anonymous-token>`. The `-t` / `--token` flag on `claim` is the **account API token**, an entirely different credential. Passing the anonymous token to `-t` fails. Product documentation showing `claim --token <anonymous-token>` is wrong; trust this rule.
12. **Present the anonymous deploy result with the fixed template in Step 4** — it is a template, not an example: reproduce it exactly, substituting only the URL and the claim link. Never show the raw `expiresAt` timestamp, never state a different duration, and never add lines to it. 60 minutes is the product's stated claim window and the conservative instruction, so that is what the template says even though the token's observed lifetime can be longer. It frames the *link* as expiring, not the project as being deleted.
13. **The claim link you present must come from `edgeone login --claim`, never the bare `claimUrl`** — right after an anonymous deploy, run `edgeone login --claim --local --json` in the background and put its `claimLoginUrl` in the template. Only that link carries the login → claim → callback chain that lets the CLI learn the login state and auto-link the project; the bare `claimUrl` from deploy output claims without telling the CLI, so the user's next deploy would create a second anonymous project. Never print `claimCommand`, `edgeone makers claim --sid ...`, or any other command as the user's way to claim — in sandboxed IDEs like WorkBuddy the user has no terminal and literally cannot run it. `makers claim` is only a fallback for headless/CI environments, run by you, never displayed.
14. **Keep the claim pitch minimal — do not over-promise, and do not teach domains** — say only that signing in *keeps* the project. ❌ Never write "permanently yours", "no time limit or access restrictions", "unlimited", or anything implying the URL then works unconditionally forever: a claimed project may still need a custom domain, and mainland-China access can require ICP filing, so those claims are false. ❌ Also do not volunteer custom domains, ICP filing, DNS, or console navigation while the user is just deciding whether to claim — that front-loads complexity onto someone who only wanted a live URL. The claim page owns the follow-up flow. Answer such topics only when the user asks.

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
| `≥ 1.6.21` ✓ | Not logged in, no saved token, **interactive** | → Go to **Anonymous Deploy** — default to anonymous when the task fits it (unattended / disposable); otherwise ask the user to choose anonymous deploy or login (see Step 2) |
| `≥ 1.6.21` ✓ | Not logged in, no saved token, **non-interactive (Agent/CI/headless)** | → Go to **Anonymous Deploy**; when the user cannot be asked, deploy with `--anonymous --json` and surface the claim link and the 60-minute claim window in the result |
| `1.6.0`–`1.6.20` | Not logged in, no saved token | Anonymous deploy is unavailable on this version → **Try Browser Login first** (see Login section). If the browser doesn't open or nothing happens within ~60 seconds, fall back to **Token Login**. Do NOT preemptively skip browser login by guessing "this looks like an Agent/CI environment" — that guess is often wrong; in particular, **WorkBuddy is a desktop IDE sandbox and fully supports browser login** |
| `≥ 1.6.0` ✓ | User explicitly provides a token or requests token login | → Go to **Deploy with Token** / **Token Login** |

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

If the user does not respond within ~60 seconds (no browser popup or no progress reported), **proactively ask** about their status (whether the browser opened, any errors, or if they want to switch to Token login). Do not wait indefinitely.

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

### Step 2: Decide the path — default to anonymous when it fits, otherwise ask

**Go anonymous directly, without asking, in either of these two cases:**

**A. The environment cannot ask** — CI, headless, no TTY, or any unattended/background session. Deploy with `--anonymous --json` and make the claim link and the 60-minute window unmissable in your result — the user had no chance to be warned in advance.

**B. The task itself is anonymous-native** — even when a human is present, skip the question and default to anonymous when the request is *disposable or unattended by nature*. Clear signals:

- **Scheduled / automated jobs** — e.g. "每日定时生成一个页面并部署", cron pipelines, any task that must run with nobody watching
- **Disposable one-offs** — a throwaway preview, a quick demo, "先看看效果", anything the user frames as temporary or just-for-now
- **Explicit anonymous intent** — the user says "免登录", "不用登录", "anonymous", or "don't make me sign up"

In case B the 60-minute expiry + claim-later model *is* the right answer, so asking is pure friction. Go straight to Step 3, and present the result with the fixed template in Step 4 (claim link + 60-minute window) — the template already tells the user how to keep it if they change their mind.

**When in doubt, ask.** Defaulting by judgment is only for the clear cases above. If a human is present and the task isn't obviously disposable — anything they might want to keep, share widely, or build on — ask instead.

**How to ask (when asking):** present the choice with the IDE's selection control (e.g. `ask_followup_question`). The option labels deliberately avoid the word "anonymous" — it is jargon and confuses non-technical users. Present these two options **exactly**, in the user's language. Do not paraphrase the labels, do not add caveats to the options themselves, and do not mention "anonymous" to the user at all.
The option text must be placed in the `label` exactly as is; it must not be split into the `description`.

**English-speaking user — present exactly these two options:**

> - **Publish now, log in later** — No login needed. Get a preview link right away; you can log in and claim the site whenever you're ready.
> - **Log in, then publish** — Log in to your EdgeOne Makers account first; the site is saved straight to your account.

**Chinese-speaking user — present exactly these two options:**

> - **直接发布，无需登录**
> - **登录后发布**

Map their pick to the flow:

- **Publish now, log in later** → this is the anonymous deploy path — continue to **Step 3**.
- **Log in, then publish** → go to **Login** (browser flow), then continue with the normal deploy.

⛔ **Do not over-promise what claiming gives them.** Say the project is *kept* / *saved to their account*, and nothing more. Specifically, do **not** say "no access restrictions", "permanently yours", or anything implying the URL is then unconditionally public and final — a claimed project can still need a custom domain and, for mainland-China access, ICP filing. Do **not** raise custom domains, ICP filing, or DNS at this point either: the user is deciding whether to log in, and those concepts are noise here. The claim page walks them through next steps.

### Step 3: Deploy

```bash
export PAGES_SOURCE=skills
edgeone makers deploy --anonymous --json
```

Add `--site china` or `--site global` only when the site must be pinned (the user told you which, or CI needs determinism). Otherwise omit it — **the CLI detects the site itself** from its own egress IP. Do not probe for the site yourself and do not synthesise `--site` from your own check.

Do **not** pass `-n`, `-e`, or `--area` — they are ignored under `--anonymous`. The project name is generated automatically.

### Step 4: Start the claim listener, then present the result

Parse the **last line** of the deploy stdout as JSON (human-readable output precedes it). Fields are **camelCase**: `url`, `projectId`, `deploymentId`, `anonymousToken`, `claimUrl`, `claimCommand`, `expiresAt`, `site`.

**Immediately start the claim listener in the background** — it must be listening before the user clicks the claim link, or the login state never reaches the CLI and the next deploy would create a second anonymous project:

```bash
edgeone login --claim --local --json
```

Run it with `run_in_background`. It prints a `{"status":"waiting","claimLoginUrl":...}` JSON line right away, then keeps listening (up to 60 minutes). Grab `claimLoginUrl` from that line. ⛔ **This URL — not the `claimUrl` field from the deploy JSON — is the claim link you show the user.** Only this link chains login → claim page → callback to the CLI. The bare `claimUrl` from deploy output would claim the project without telling the CLI, and the user's next deploy would go to a new anonymous project instead of the claimed one.

⛔ **The listener is invisible to the user — never narrate it.** Do not tell the user a listener/监听器 is running, that you are "waiting for the claim callback", or any other internal mechanism status (state files, JSON parsing, ports). The user-facing surface is exactly one thing: the template below. Claiming is presented as "open the link and sign in", not as a process you are watching.

⛔ **Send the template as its own message, after the deploy command has fully returned.** Do not emit it in the same message in which you ran the deploy, do not attach it to the command's output, and do not print it while the command is still running. In WorkBuddy, content emitted alongside a running/finished command can be folded into a collapsible process message — if that happens, the user never sees the URL or the claim link. Wait for the Bash call to end, then send the template alone as your next reply.

⛔ **This is a fixed template, not a suggestion.** Reproduce it exactly: same four lines, same order, same emoji, same separator. Substitute **only** `<url>` (from the deploy JSON) and `<claimLoginUrl>` (from the `login --claim` output). Do not reword, merge, split, or reorder lines. Do not add a sentence before or after it. Do not append project ID, deployment ID, console URL, `expiresAt`, next steps, or commentary of any kind.

**English-speaking user — emit exactly this:**

> 🌐 **Live URL**: `<url>`
>
> ---
>
> ⏳ **This link expires in 60 minutes**.
>
> 👉 [Claim this project](<claimLoginUrl>) — please claim it within 60 minutes.

**Chinese-speaking user — emit exactly this:**

> 🎉 部署成功
> 🌐 **访问地址**：`<url>`
>
> ---
>
> ⏳ **该链接 60 分钟后失效**。
>
> 👉 [认领这个项目](<claimLoginUrl>) —— 请在 60 分钟内完成认领。

For any other language, translate **this** template and nothing more — keep the four lines, the emoji, the separator, and the exact same content. Do not take the freedom to add or explain.

Afterwards, stop. Anything you feel like adding here — what claiming unlocks, custom domains, ICP filing, DNS, console navigation, an offer to claim on their behalf — is prohibited by critical rules 13 and 14. Answer those topics only if the user asks.

### After the user claims

The background `login --claim` process exits on its own when the console relays the result. When it exits 0 with `{"status":"success",...,"linked":true}`:

- the CLI is logged in (credentials saved, plus `.edgeone/auth.json` from `--local`),
- the project is linked (`.edgeone/project.json`),
- `.edgeone/anonymous.json` is removed.

Tell the user plainly, in their language: the project is now in their account, and any further deploys will update that same project. Then use the normal deploy flow (`edgeone makers deploy --json`) for all later deploys.

If the process exits non-zero (the user never completed the link within 60 minutes), the anonymous project is still unclaimed: re-run `edgeone login --claim --local --json` for a fresh link and present it again in the same template.

If the user asks you to "帮我认领" / "claim it for me": point them to the same link again while the listener is still running; if it already exited, re-run the command for a fresh link. Never print the CLI claim command — `edgeone makers claim --sid` remains only for headless/CI environments with no browser (see critical rule 13).

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

**Show the user — the deploy URL MUST be at the very top of the visible reply AND pinned via `present_files` to the side panel (see Rule 4 for why both channels are required):**

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
| `Failed to create pages project` (dev) / `Makers project exceeds 40 limit` (deploy) | Account hit the **40-project cap**. Both dev and deploy fail the same way. Present ONLY these two options to the user, verbatim — no "recommended" tag on either, no third option (do NOT suggest CloudStudio or any other platform, do NOT invent alternatives): ① user deletes an unused project in the EdgeOne Makers console; ② user names an existing linked project via `-n <existing-project-name>`. Agent MUST NOT delete projects itself (CLI has no delete command by design — do not route around via HTTP APIs or cached credentials). |
| Project name conflict | Use a different name with `-n` |
| Build failure | Check logs — usually missing deps or bad build script |
| `whoami` says "not authenticated" but `edgeone login` just succeeded | Expected in agent/headless: `whoami` and `makers dev`/`deploy` read API-Token auth, not the browser session. Reuse the auto-generated token from `~/.edgeone/<hash>` (`value.Token`) as `EDGEONE_PAGES_API_TOKEN` / `-t`. See Token Login note above. |
| `makers dev` hangs on an interactive "Link existing / Create and link" menu | Dev was started without `-n` and fell into the interactive picker. Kill it, then restart with `edgeone makers dev -n <project-name> --skip-env-sync` — dev auto-creates the project if missing and links it internally. Always pass `-n` to dev whenever the project uses Blob/KV. |
| `curl` to the deploy URL returns 302 → DingTalk SSO login | Preview gateway requires browser-based `eo_token` validation (JS), which `curl` can't do. Open the full `?eo_token=...&eo_time=...` URL in a real browser — it validates the token and bypasses SSO. Not a code bug. |

---

For CLI command reference, environment variables, local dev setup, and token management details, see [references/command-reference.md](references/command-reference.md).
