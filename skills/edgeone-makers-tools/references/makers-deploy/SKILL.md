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
  use makers-env-adaption / makers-recipes for troubleshooting).
pathPatterns:
  - "*.sh"
  - .github/workflows/**
validate:
  - pattern: "whoami[^\\n]*\\s-t\\s"
    message: "edgeone whoami does not accept -t. Check the exit code instead: 0 = logged in, 1 = not."
metadata:
  author: edgeone
  version: "2.12.4"
---

# EdgeOne Makers Deployment Skill

Deploy any project to **EdgeOne Makers**.

## ⛔ Critical Rules (never skip)

1. **CLI version ≥ `1.6.0`** — reinstall if lower. Versions below `1.6.0` lack the non-interactive fixes (whoami fail-fast, `--json` output) and hang in Agent/CI environments. Never proceed with an outdated version. **Anonymous deploy and `claim` additionally require `1.6.29`** — that is a higher, feature-specific floor; see **Anonymous Deploy**. Do not block a normal authenticated deploy because the CLI is below `1.6.29`.
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
3b. **Check login and the intended target separately** — `edgeone whoami` reports the effective credential, not necessarily the workspace a linked deploy adopts. Read [makers-cli](../makers-cli/SKILL.md) for workspace and credential precedence. Parse `.edgeone/project.json`; never infer a link from `edgeone.json`. Do not inspect or print raw credentials as a login check.
4. **The deploy URL MUST be placed at the very top of the visible reply body (own line, code block, or heading — not inline, not mid-reply), AND ALSO pinned via `present_files` (or the IDE's preview tool) to the side panel.** Two UI failures to survive: thinking / reasoning / "深度思考" blocks hide content by default; long replies get auto-folded by IDE chat cards, burying anything placed mid-reply. `present_files` is unaffected by chat folding — that's the second, always-visible channel. Complete URL, no truncation (Rule 2). Example format:
   ```
   🌐 Live URL: https://my-project-abc123.edgeone.cool?<auth_query_params>
   ```
   Then append any other notes (console URL, caveats, etc.).

   **Self-check before ending the turn (MANDATORY)** — read back what the user will actually SEE (NOT your thinking / reasoning content). Two questions: (a) Is the complete `.edgeone.cool` URL present at the top of the visible reply, in a code block or heading? (b) Was `present_files` called with that URL? If either answer is no, send an **additional short message** containing ONLY the `🌐 Live URL: <full URL>` block and call `present_files`. Do not end the turn until both channels carry the URL. "I already mentioned it in my reasoning" is NOT a substitute for placing it in the visible body.
5. **Ask the user to choose China or Global site** before browser login. Never assume. (Token login via `edgeone login --interaction agent --token` auto-detects site, no need to ask.)
6. **Always add `--interaction agent` to login, account switch and workspace switch operations.** Prefer browser login plus conversation selection. A `selection_required` result is pending, not an error or login success; follow [makers-cli](../makers-cli/SKILL.md) to ask the user and resume. A missing terminal is not a reason to request an API token. Use tokens only when explicitly requested/supplied, browser callbacks genuinely cannot work, or CI is unattended.
7. **Offer persistent token login only with user consent.** Prefer CLI-managed `login --token` (add `--local` when appropriate), not a second agent-managed token cache.
8. **Before triggering any browser popup (login / registration), explain the reason and the benefits to the user first** — never silently launch a browser window.
9. **On any CLI failure, surface the actual error text to the user before retrying, switching commands, or proposing a workaround.** Do NOT paraphrase (e.g. don't rewrite `Makers project exceeds 40 limit` into "maybe a name conflict or permission"). Do NOT silently pivot from `makers dev` to `makers deploy` (or vice versa) hoping to bypass — a systemic failure (auth / quota / permission) hits both with the same cause. Quote the raw error, name the root cause, then propose the fix or ask the user.
10. **Write every user-facing message in the user's own language** — **all** prose, blockquotes, and prompts in this skill are written in English purely to specify *meaning*; none of it is a string to paste. If the user writes to you in Chinese, speak Chinese — the login explanation, the site choice, the token question, the deploy result, all of it. Likewise for any other language. Emitting this skill's English strings into a non-English conversation is a bug. Only literal CLI commands, flags, env var names, and JSON field names stay verbatim. ⚠️ Where this skill gives a **fixed template** (Steps 2 and 4 of Anonymous Deploy), translating it is required but rewriting or extending it is not allowed — match it line for line.

**Rules 11-14 apply to the anonymous deploy / claim flow only:**

11. **The claim command's parameter is `--sid`, NOT `--token`** — `edgeone makers claim --sid <anonymous-token>`. The `-t` / `--token` flag on `claim` is the **account API token**, an entirely different credential. Passing the anonymous token to `-t` fails. Product documentation showing `claim --token <anonymous-token>` is wrong; trust this rule.
12. **Present the anonymous deploy result with the fixed template in Step 4** — it is a template, not an example: reproduce it exactly, substituting only the URL and the claim link. Never show the raw `expiresAt` timestamp, never state a different duration, and never add lines to it. 60 minutes is the product's stated claim window and the conservative instruction, so that is what the template says even though the token's observed lifetime can be longer. It frames the *link* as expiring, not the project as being deleted.
13. **The claim link you present must come from `edgeone login --interaction agent --claim`, never the bare `claimUrl`** — right after an anonymous deploy, run `edgeone login --interaction agent --claim --local --json` in the background and put its `claimLoginUrl` in the template. Only that link carries the login → claim → callback chain that lets the CLI learn the login state and auto-link the project; the bare `claimUrl` from deploy output claims without telling the CLI, so the user's next deploy would create a second anonymous project. Never print `claimCommand`, `edgeone makers claim --sid ...`, or any other command as the user's way to claim — in sandboxed IDEs like WorkBuddy the user has no terminal and literally cannot run it. `makers claim` is only a fallback for headless/CI environments, run by you, never displayed.
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

Run these checks first, then follow the decision table. **Run them silently** — do not narrate versions, login-state probes, or eligibility results to the user (e.g. never say "CLI 版本 x.x（支持匿名部署）" or "纯静态、无依赖、可直接发布"). Speak only when a check changes the outcome (needs upgrade, needs login).

```bash
# Check 0: Set environment variable (required before any edgeone command)
export PAGES_SOURCE=skills

# Check 1: CLI installed and correct version? (must be >= 1.6.0; anonymous deploy needs >= 1.6.29)
edgeone -v

# Check 2: Already logged in? (whoami fails fast, won't hang)
edgeone whoami
# Exit 0 verifies a credential, not the intended workspace/project
# With an explicit token, do not probe a different saved login

# NOTE: This auth gate is for `deploy` (account-bound upload to your EdgeOne
# account). For `edgeone makers dev` (local preview), login is ONLY required
# when the project uses Blob/credentialed backends — a pure-static dev needs
# no login. When Blob IS used, the chain is: Blob → must be linked → linking
# requires login, so login before linking/starting dev. See makers-storage /
# makers-env-adaption for the dev auth rule and the link chain.

# Check 3: Read association metadata, not build configuration
cat .edgeone/project.json 2>/dev/null
```

Parse the JSON and check non-empty `ProjectId`, `Name`, and optional legacy `ZoneId`; do not equate file presence with a valid link. For authenticated workspace selection, verify `edgeone workspace --help`, then use `edgeone workspace ls` when the current/linked distinction is unclear. Its `current` row can differ from `linked (this directory)`. Read [makers-cli](../makers-cli/SKILL.md) before selecting a target.

- Existing valid link: default deploy follows its workspace, not the globally selected one.
- No link: confirm the intended workspace/project before `-n` can create a resource.
- To change this directory's future deployment workspace, `workspace use` alone is insufficient: follow [the standard cross-workspace re-link flow](../makers-cli/SKILL.md#re-link-this-directory-to-another-workspace): completed switch, verify B with `whoami`, explicit `link --name`, verify the saved ProjectId/ZoneId, then deploy. A same-name `deploy -n` is not a re-link operation. Do not move/delete the association file as a normal step, and do not re-link for a read-only check. A different `-n` is only for a deliberate alternative deployment target.
- Explicit `-t` / environment token: keep that credential. If the linked `ProjectId` is not visible, do not silently create a replacement or rename the project to bypass the mismatch.
- Legacy link missing `ZoneId`: let the CLI resolve a visible project. If unknown, do not guess; stop on target ambiguity. A query failure is not evidence that the project does not exist.
- Do not use `--zone-id` or `edgeone.json.zone_id` to steer a deployment. The token binds the workspace.

### Decision Table

| CLI version | Login status | Action |
|-------------|-------------|--------|
| Not installed or < 1.6.0 | — | → Go to **Install CLI** |
| `≥ 1.6.0` ✓ | Matching credential and resolved project/workspace target | → Go to **Deploy** |
| `≥ 1.6.0` ✓ | Legacy saved token exists | Reuse only with consent and confirmed target; never override an existing login/link automatically |
| `≥ 1.6.29` ✓ | Not logged in, no saved token | → Go to **Anonymous Deploy** — default to anonymous only when the task is anonymous-native (scheduled / disposable / user asked for it); otherwise ask the user to choose anonymous deploy or login. If there is no way to ask, deploy with `--anonymous --json` and surface the claim link and the 60-minute window in the result (see Step 2) |
| `1.6.0`–`1.6.28` | Not logged in, no saved token | Anonymous deploy unavailable. Upgrade to a build exposing the Agent login protocol before browser login; do not drop the interaction flag or assume TTY availability |
| `≥ 1.6.0` ✓ | User explicitly provides a token or requests token login | → Go to **Deploy with Token** / **Token Login** |

---

## Install CLI

```bash
npm install -g edgeone@latest
```

Verify: `edgeone -v` — confirm output is `1.6.0` or higher. Retry installation if not. (Versions < 1.6.0 hang on `whoami`/login in non-interactive environments and lack `--json`.) Anonymous deploy and `claim` need `1.6.29`; if `latest` is still below that, those two features are simply unavailable — normal authenticated deploy works fine.

---

## Login

### 0. Explain the registration/login step

Before triggering any login flow, explain to the user **why** this step is needed and **what** to expect. Do not silently launch a browser window.

Tell the user:

> You need to log in or register an EdgeOne Makers account. Here's what to expect:
> - **Why login is required**: Deployment uploads your build output to your own account, generating a unique access URL and project record.
> - **What you get for free**: EdgeOne Makers offers a free tier with global CDN acceleration, automatic HTTPS, and custom domain binding — typically more than enough for personal projects.
> - **What happens next**: I'll run `edgeone login --interaction agent`, and your default browser will open the Tencent Cloud login page. Please complete the login/registration and authorize access, then come back here.
> - **If multiple workspaces are available**: I'll ask which one to use here, then finish authentication and continue the task. You do not need to copy an API token to make that selection.

If the user does not respond within ~60 seconds (no browser popup or no progress reported), **proactively ask** about their status (whether the browser opened, any errors, or if they want to switch to Token login). Do not wait indefinitely.

### 1. Ask the user to choose a site, then ALWAYS pass `--site`

Use the IDE's selection control (`ask_followup_question`) before running any login command:

> Choose your EdgeOne Makers site:
> - **China** — For users in mainland China (console.cloud.tencent.com)
> - **Global** — For users outside China (console.intl.cloud.tencent.com)

⚠️ **CRITICAL**: After the user chooses, you MUST invoke login with an explicit
`--site <china|global>` plus `--interaction agent` (e.g. `edgeone login --site china --interaction agent`). Use the already-known site rather than asking again. Site choice and workspace choice are separate; the latter happens after browser auth when the CLI returns a list. A session resume uses its stored site and does not need another site prompt; token and claim flows retain their own site resolution.

### 2. Login methods reference

Use `--interaction agent` for all login/switch operations, regardless of TTY. Prefer browser authentication with workspace selection in the conversation.

| Method | When it applies |
|--------|-----------------|
| **Browser Login** | Default for a person using a skill/connector. Exactly one usable workspace in a one-row list is automatic; multiple rows require conversation selection and resume. |
| **Token Login** | User explicitly supplies/requests a token, browser callbacks genuinely cannot work, or unattended CI uses pre-provisioned credentials. Missing terminal input is not enough. |

After browser auth, wait for workspace selection and final token exchange, not just the browser callback. Use `whoami` / `workspace ls` to check account and workspace without exposing credentials. Never assume a default workspace based on name, plan or list order.

#### Browser Login

```bash
# China site
edgeone login --interaction agent --site china

# Global site
edgeone login --interaction agent --site global
```

Run browser login in the background and relay the `waiting.loginUrl`; keep the listener alive while the user authenticates. On `selection_required`, ask the user to choose a workspace, then resume the returned `sessionId` with the selected ID in the same directory, as defined in [makers-cli](../makers-cli/SKILL.md). Exit 0 while selection is pending is not login success. Only continue the original deployment after completed authentication and target checks.

⚠️ **Browser Session Reuse Trap**: If the user previously logged into a **different site** (e.g., logged into Global site before, now trying China site, or vice versa), the browser may **silently reuse the old Tencent Cloud session**. The CLI will appear to succeed, but actually binds to the wrong account — subsequent `deploy` will fail with auth errors or `whoami` shows an unexpected account.

If this happens, guide the user to:
1. Click "**Sign in with a different account**" on the login page; or
2. Log out from **all Tencent Cloud consoles** (both `console.cloud.tencent.com` and `console.intl.cloud.tencent.com`) first, then re-run `edgeone login --interaction agent`.

#### Token Login

Two methods available:

**Method A: `edgeone login --interaction agent --token` (persistent, recommended)**

```bash
edgeone login --interaction agent --token <token>
```

Auto-detects china/global from the token — no `--site` flag needed. Persists login state for subsequent commands.

Reuse a valid CLI-managed login without extracting secrets from hashed global files. Each API token is bound to a workspace: switching globals does not change an explicitly supplied token. For another workspace, obtain its token or complete its browser login. Persistent token login clears previous workspace caches; use per-invocation `-t` when persistence is not intended.

**Method B: Pass `-t` directly in deploy (per-invocation)**

Token is used for that single deploy only; no persistent login state is saved.

```bash
edgeone makers deploy -t <token>
```

**Important**: `edgeone whoami` does not accept `-t`. Do not check a different saved login to validate an explicit token. Resolve the intended project/link first, let the CLI validate the explicit token and project visibility, and stop on a mismatch; providing a token does not authorize a replacement project.

Guide the user to obtain a token:
1. Go to the console:
   - **China**: https://console.cloud.tencent.com/edgeone/pages?tab=settings
   - **Global**: https://console.intl.cloud.tencent.com/edgeone/pages?tab=settings
2. Find **API Token** → **Create Token** → Copy it

⚠️ Remind the user: the token has account-level permissions. Never commit it to a repository.

### 3. Offer persistent login with consent

A per-invocation `-t` does not persist credentials. Ask whether to keep the target-workspace login; only with consent use `edgeone login --interaction agent --token <token>`, adding `--local` for a project-local credential copy. Check the command result before claiming persistence succeeded. Keep `.edgeone/auth.json`, `.env`, and credential caches out of Git and logs.

Do not create a new `.edgeone/.token` cache. Existing legacy files are agent-managed, not automatically loaded by the CLI; reuse only with consent and a confirmed target. Never print a saved token to inspect it.

---

## Deploy

### Browser-authenticated deploy (Makers projects)

```bash
# Valid .edgeone/project.json link: follow its project/workspace
edgeone makers deploy

# No link: use the confirmed effective workspace and project name
edgeone makers deploy -n <project-name>
```

Choose `<project-name>` only after confirming the target; a directory-derived name is a suggestion, not permission to create a replacement. The CLI persists association in `.edgeone/project.json`. A different explicit `-n` bypasses the old link's workspace and may change the local association after deployment.

### Token-based deploy (Makers projects)

Use the explicitly supplied token for the intended workspace, or an existing CLI-managed matching login. Do not dump `.edgeone/.token` or hashed global credential files. If no matching credential is available, request a token created for the target workspace. Explicit `-t` / `EDGEONE_PAGES_API_TOKEN` wins over cached linked/global credentials; the CLI must verify the linked project is visible before proceeding.

```bash
# Project already linked
edgeone makers deploy -t <token>

# New project
edgeone makers deploy -n <project-name> -t <token>
```

The token already contains site info — no `--site` flag needed.

After a successful deploy with a manually-entered token, ask whether to persist login (see "Offer persistent login with consent" above).

### Deploy to preview environment

```bash
edgeone makers deploy -e preview
```

### Non-interactive / Agent / CI deploy (recommended: `--json`)

When running inside an Agent, CI, or any non-TTY context, **add `--json`** so the final
result is emitted as a single machine-readable line — no scraping of colored stdout:

```bash
edgeone makers deploy --json
edgeone makers deploy -t <target-workspace-token> --json
```

### Makers Agent Projects deploy

For projects with `agents/` directory (AI Agent projects), use `edgeone makers deploy` which auto-runs build:

```bash
edgeone makers deploy -t <target-workspace-token> --json
edgeone makers deploy -t <target-workspace-token> --json -e preview
```

Note: `edgeone makers deploy` automatically runs build before deploying — no separate `edgeone makers build` step needed.

### Build behavior

The CLI auto-detects the framework, runs the build, and uploads the output directory. No manual config needed.

---

## Anonymous Deploy (no login required)

When the user is not logged in and has no token, they can deploy anonymously and claim the project later. Requires CLI `>= 1.6.29`. On `1.6.0`–`1.6.28` this feature does not exist — use **Login** or a token instead.

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

⛔ **All checks in this flow are silent — never narrate them to the user.** Do not report things like "CLI 版本 x.x（支持匿名部署）", "页面是纯静态、无 Blob/KV 依赖，可直接发布", or any other version/eligibility check result. These are internal reasoning; a non-technical user cannot act on them and should never see them. The only time you speak about a check is when it **changes the outcome** — e.g. the project needs login (below), or the CLI is too old and needs upgrading. Passing checks produce no message at all.

**KV cannot be detected this way — you must ask.** A KV namespace is bound in the console and exposed as a *global variable* whose name the user chose (e.g. `my_kv`), so there is no package import to grep for. There is no `@edgeone/pages-kv` package. Ask the user directly:

> Does this project use KV storage?

If either check hits, or the user says the project uses KV, **do not deploy anonymously.** Go to **Login** and tell the user why (note the user-facing wording: "without login", never "anonymous"):

> This project needs environment variables / AI gateway credentials or a storage binding, which a login-free deploy cannot provide. The site would load but those features would fail. Let's log in so it works properly.

Plain static sites and frontend-framework projects with no such dependency may proceed.

If the user acknowledges the limitation and still wants to publish without logging in, you may proceed — but state prominently in your result that AI and storage features will not work until the project is claimed and configured (again: phrase it as "login-free / 免登录", never "anonymous / 匿名").

### Step 2: Decide the path — default to anonymous only when the task fits, otherwise ask

**Go anonymous directly, without asking, only when the task itself is anonymous-native** — disposable or unattended by nature. Clear signals:

- **Scheduled / automated jobs** — e.g. "每日定时生成一个页面并部署", cron pipelines, any task that must run with nobody watching
- **Disposable one-offs** — a throwaway preview, a quick demo, "先看看效果", anything the user frames as temporary or just-for-now
- **Explicit anonymous intent** — the user says "免登录", "不用登录", "anonymous", or "don't make me sign up"

In these cases the 60-minute expiry + claim-later model *is* the right answer, so asking is pure friction. Go straight to Step 3, and present the result with the fixed template in Step 4 (claim link + 60-minute window) — the template already tells the user how to keep it if they change their mind.

**Everything else — ask.** If the task isn't obviously disposable — anything the user might want to keep, share widely, or build on — present the choice. Do NOT try to judge the *environment* to skip the question: sandbox/TTY signals are unreliable and guessing wrong either needlessly interrupts a human or silently deploys something they wanted to keep.

If the environment genuinely gives you no way to ask at all (no TTY, no question tool), asking is impossible — that's a constraint, not a judgment call. Deploy with `--anonymous --json` and make the claim link and the 60-minute window unmissable in your result.

**How to ask (when asking):** present the choice with the IDE's selection control (e.g. `ask_followup_question`). The option labels deliberately avoid the word "anonymous" — it is jargon and confuses non-technical users. Present these two options **exactly**, in the user's language. Do not paraphrase the labels, do not add caveats to the options themselves, and do not mention "anonymous" to the user at all — when you must name the concept, call it **"login-free deployment" / 「免登录部署」**, never "anonymous deploy / 匿名部署".
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
edgeone login --interaction agent --claim --local --json
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

If the process exits non-zero (the user never completed the link within 60 minutes), the anonymous project is still unclaimed: re-run `edgeone login --interaction agent --claim --local --json` for a fresh link and present it again in the same template.

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
| `--anonymous` / `claim` reported as an unknown option | The installed CLI is below `1.6.29`. Run `npm install -g edgeone@latest`; if that is still below `1.6.29`, anonymous deploy is not released yet — use login or a token instead |
| Browser does not open during login | Relay `waiting.loginUrl` for manual browser authentication and keep the listener alive. Token login is an alternative only if callbacks genuinely cannot work or the user explicitly requests it |
| "not authenticated" / exit 1 from `whoami` | Expected when not logged in — whoami fails fast instead of hanging. Offer anonymous deploy (see Anonymous Deploy), run `edgeone login --interaction agent`, or provide a token |
| Deploy says "browser login is unavailable" + exits 1 | For a person in an Agent host, complete explicit browser login with `edgeone login --interaction agent` and handle conversation selection before retrying the original target. Do not add unsupported interaction flags to deploy. Unattended CI uses pre-provisioned credentials |
| Deploy seems to hang at `[DeployStatus] Deploying...` | Non-TTY emits heartbeat lines; it is NOT stuck. If a wrapper still mis-detects, use `--json` or run in background and poll. Do not kill it |
| Auth error with token | Token may be expired — regenerate at the console |
| Login appears successful but `deploy` reports auth error | Browser reused a session from the wrong site, binding the wrong account. Click "Sign in with a different account" on the login page, or log out from all Tencent Cloud consoles first |
| `edgeone whoami` shows an unexpected account | Browser session reuse. Click "Sign in with a different account" or log out from all consoles and re-login |
| `Failed to create pages project` (dev) / `Makers project exceeds 40 limit` (deploy) | Account hit the **40-project cap**. Both dev and deploy fail the same way. Present ONLY these two options to the user, verbatim — no "recommended" tag on either, no third option (do NOT suggest CloudStudio or any other platform, do NOT invent alternatives): ① user deletes an unused project in the EdgeOne Makers console; ② user names an existing linked project via `-n <existing-project-name>`. Agent MUST NOT delete projects itself (CLI has no delete command by design — do not route around via HTTP APIs or cached credentials). |
| Project name conflict | Use a different name with `-n` |
| Build failure | Check logs — usually missing deps or bad build script |
| Login returned but `whoami` is not authenticated | Check the actual login error, callback, workspace selection and final token persistence; local auth / exported tokens may shadow globals. Do not extract secrets from global files. Use a confirmed target-workspace token if login cannot complete. |
| `makers dev` enters a link menu | Parse the association first. For an unlinked project, confirm workspace/name and create/link explicitly; use `--name` only for intended initial linking. For an already-linked project, preserve its target and use `--skip-env-sync`. |
| `workspace` / `--interaction` protocol is unavailable | Upgrade and check login/use help for the registered options; if still unavailable, stop and explain the missing Agent protocol. Do not drop flags or ask for a token just to bypass selection |
| Project not visible to the current token / legacy link has no `ZoneId` | Project may be in another workspace or deleted. Inspect current/linked marks, select its owning credential, and retry; do not silently create a replacement |
| Global workspace changed but linked deploy still uses the old workspace | Expected: directory link wins by default. Re-link deliberately or select a different deployment name; global switching alone does not move a project |
| Explicit token or `.edgeone/auth.json` keeps selecting the old workspace | Change the intended explicit credential/local login with consent; `workspace use` does not overwrite these sources |
| Cached workspace token is rejected | Let the CLI discard the invalid entry; complete target-workspace login or supply its token without clearing all valid credentials |
| Workspace paused, unavailable, or provisioning | Resume/repair in the console, or wait if provisioning. Do not create replacement projects to bypass status errors |
| Project query fails | Show the original failure; network/auth failure is not evidence the project is absent |
| `curl` to the deploy URL returns 302 → DingTalk SSO login | Preview gateway requires browser-based `eo_token` validation (JS), which `curl` can't do. Open the full `?eo_token=...&eo_time=...` URL in a real browser — it validates the token and bypasses SSO. Not a code bug. |

---

For CLI command reference, environment variables, local dev setup, and token management details, see [references/command-reference.md](references/command-reference.md).
