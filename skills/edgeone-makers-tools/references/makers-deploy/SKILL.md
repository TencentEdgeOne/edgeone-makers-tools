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
    message: "edgeone whoami does not accept -t. Use safely injected environment credentials and whoami --json: true = authenticated, false = unauthed, null = verification failed; exit 1 alone is not enough."
metadata:
  author: edgeone
  version: "2.12.4"
---

# EdgeOne Makers Deployment Skill

Deploy any project to **EdgeOne Makers**.

## ⛔ Critical Rules (never skip)

1. **CLI version ≥ `1.7.0` for every CLI execution flow**, including authenticated and anonymous deployment / claim. Upgrade lower versions before commands, and verify the installed binary's capabilities via makers-cli. If the planned public release is not yet available, stop and report that instead of repeatedly installing or using old-version login/token fallbacks. Writing code alone does not require CLI installation.
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
3b. **Use the shared authentication flow** in [makers-cli](../makers-cli/SKILL.md). After verifying CLI ≥ 1.7.0 and JSON capability, check `whoami --json`: true = authenticated, false = explicitly unauthed, null = verification failed. Missing JSON capability means checking the actual package/path, not falling back to an older CLI; exit 1 alone does not prove missing login. Do not inspect private credential caches or write a separate token file. Login, workspace switching, account switching and changing the directory target are different actions.
4. **The deploy URL MUST be placed at the very top of the visible reply body (own line, code block, or heading — not inline, not mid-reply), AND ALSO pinned via `present_files` (or the IDE's preview tool) to the side panel.** Two UI failures to survive: thinking / reasoning / "深度思考" blocks hide content by default; long replies get auto-folded by IDE chat cards, burying anything placed mid-reply. `present_files` is unaffected by chat folding — that's the second, always-visible channel. Complete URL, no truncation (Rule 2). Example format:
   ```
   🌐 Live URL: https://my-project-abc123.edgeone.cool?<auth_query_params>
   ```
   Then append any other notes (console URL, caveats, etc.).

   **Self-check before ending the turn (MANDATORY)** — read back what the user will actually SEE (NOT your thinking / reasoning content). Two questions: (a) Is the complete `.edgeone.cool` URL present at the top of the visible reply, in a code block or heading? (b) Was `present_files` called with that URL? If either answer is no, send an **additional short message** containing ONLY the `🌐 Live URL: <full URL>` block and call `present_files`. Do not end the turn until both channels carry the URL. "I already mentioned it in my reasoning" is NOT a substitute for placing it in the visible body.
5. **Standalone uses agent interaction, not auto.** Complete browser authentication and the user's workspace choice using the shared CLI flow; only pin `--site` when the user specified it. Do not guess a workspace from plan/name/order.
6. **Keep independent usage supported.** MCP is an optional equivalent path, not a required dependency. Desktop browser login is available where the host supports it; browserless CI keeps using securely provisioned environment credentials. Never force an expert team or a browser in unattended CI.
7. **Credentials remain CLI-managed.** Do not extract cached tokens or offer a new token file. Persistent local login is an explicit user choice, not an automatic fallback for switching failure.
8. **Before a browser popup, briefly ask the user to complete login.** Waiting output or elapsed time alone does not prove failure; retain the callback listener and original pending result. Do not start another authentication just because a tool call returned choices.
9. **On failure, preserve its concrete cause and stop unsafe retries.** Use structured errorCode/message, summarize safely in the user's language, and do not print raw headers or credential paths. Do not guess hidden prompts, switch dev/deploy to bypass errors, or replay possibly consumed authentication after an approval-triggered re-run; follow the shared retry boundary.
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

Run these checks first, then follow the decision table. **Run them silently** — do not narrate versions, login-state probes, or eligibility results to the user (e.g. never say "CLI 版本 x.x（支持匿名部署）" or "纯静态、无依赖、可直接发布"). Speak only when a check changes the outcome (needs upgrade, needs login).

```bash
# Check 0: Set environment variable (required before any edgeone command)
export PAGES_SOURCE=skills

# Check 1: Require CLI >= 1.7.0 before further operations
edgeone -v
# Stop if the required public release is unavailable; do not use an older CLI

# Check 2: Verify JSON status capability and actual credentials
edgeone whoami --json
# true = authenticated; false = unauthed; null = could not verify
# An exit 1 alone must not trigger another login

# NOTE: This auth gate is for `deploy` (account-bound upload to your EdgeOne
# account). For `edgeone makers dev` (local preview), login is ONLY required
# when the project uses Blob/credentialed backends — a pure-static dev needs
# no login. When Blob IS used, the chain is: Blob → must be linked → linking
# requires login, so login before linking/starting dev. See makers-storage /
# makers-env-adaption for the dev auth rule and the link chain.

# Check 3: Read only the project association, not credential files
cat .edgeone/project.json 2>/dev/null
```

### Decision Table

| CLI version | Login status | Action |
|-------------|-------------|--------|
| Not installed or < 1.7.0 | — | → **Install CLI**; if the required public package is unavailable, stop instead of continuing with an older version |
| `≥ 1.7.0` ✓ | Authenticated, owning project/target confirmed | → **Deploy**; keep existing directory association |
| `≥ 1.7.0` with verified capabilities | Pending selection or business confirmation | → Shared CLI flow: ask by names, continue original result or confirm via workspace use; no deploy yet |
| `≥ 1.7.0` | Identity verification error/unknown | Stop and explain the safe cause; do not automatically relogin or switch |
| `≥ 1.7.0` ✓ | Explicitly unauthed, no environment credentials | → **Anonymous Deploy** only when that task fits or the user chooses it; otherwise agent browser login. Do not use login-free deployment to bypass an existing project's auth/target error |
| `≥ 1.7.0` ✓ | Securely provided environment credentials | Verify effective identity/target; use the same deployment flow without creating a token cache |

---

## Install CLI

```bash
npm install -g edgeone@latest
```

Verify `edgeone -v` is `1.7.0` or higher, then check the actual command capabilities via makers-cli. If `@latest` resolves below the baseline or the planned release is not published yet, report the unavailable release and stop; do not repeatedly install or continue via a lower-version authenticated/token path. Prepare these changes on a feature branch, and publish the Skill only after public CLI `1.7.0` is available and verified.

---

## Login

Use [makers-cli](../makers-cli/SKILL.md) as the single login/workspace instruction source. It applies to independent Skill users without an expert team or MCP. Do not repeat an older site-only login procedure here.

1. Check effective identity without printing private files. If explicitly unauthed and a browser is available, say “请打开链接完成登录。” and run the agent login flow in the project directory. A site flag is optional on the unified page unless the user chose a site.
2. On `selection_required`, show available workspace names neutrally. Continue with the original returned parameters; waiting or exit 0 is not completion. If the account is already authenticated and the user wants another workspace, use `workspace use`, not another `login`. `switch` changes accounts, not workspaces.
3. When switching needs an uncached credential, let the supported workspace command drive target-specific browser authentication. Existing cached credentials may avoid it; never promise all spaces switch without login. Keep the pending listener alive and do not combine login, polling and resume into one automatically replayed shell script.
4. If a host approval re-runs an already partially executed command, inspect identity before another attempt. Follow the shared one-use-result recovery rules; do not disable file policy, replay consumed results, or imply that using a single shell fixes the CLI's persistence failure.
5. In browserless CI or explicit token use, accept credentials through the host's secure environment mechanism with the matching region, not chat echo or a command string. `whoami` has no `-t` option, but safely injected environment credentials can be verified before business operations. A token is scoped to its actual workspace, not interchangeable across targets.
6. Leave credential persistence to CLI. Do not read private caches, create `.edgeone/.token`, or automatically add `--local`; explicit local persistence can keep an old credential active after a global switch. Obtain consent to change the source when this happens, not to blindly delete it.

Authentication failure, unknown identity and unconfirmed business target are different states. Briefly tell the customer the action needed, keep internal IDs and commands out of normal conversation, and continue the original authorized task after verification without another “continue” prompt.

---

## Deploy

### Browser-authenticated deploy (Makers projects)

```bash
# Verified directory association exists in .edgeone/project.json
edgeone makers deploy --json

# Unbound project, after confirming its name and target workspace
edgeone makers deploy -n <project-name> --json
```

Confirm the meaningful name and workspace before creating a new project. `.edgeone/project.json` records the resulting association; `edgeone.json` only configures the application. Existing projects omit replacement names. Global selection changes alone never move the directory target. For an explicitly requested change, follow the shared safe link flow and verify the new association before deployment.

### Token-based deploy (Makers projects)

Use the same commands as browser-authenticated deployment with securely injected `EDGEONE_PAGES_API_TOKEN` and matching `EDGEONE_PAGES_API_REGION`. Verify the effective target; token presence alone is not authorization to choose a workspace or replace a directory association. CLI may reuse valid stored credentials internally, but the Skill must not extract those values or persist an extra token file. This remains supported for independent Skill / CI users without MCP or browser interaction.

### Deploy to preview environment

```bash
edgeone makers deploy -e preview
```

### Non-interactive / Agent / CI deploy (recommended: `--json`)

When running inside an Agent, CI, or any non-TTY context, **add `--json`** so the final
result is emitted as a single machine-readable line — no scraping of colored stdout:

```bash
# Existing confirmed target
edgeone makers deploy --json
# New project only after name/workspace confirmation
edgeone makers deploy -n <project-name> --json
```

### Makers Agent Projects deploy

For projects with `agents/` directory (AI Agent projects), use `edgeone makers deploy` which auto-runs build:

```bash
# Linked Agent project; credentials remain CLI-managed or securely injected
edgeone makers deploy --json
edgeone makers deploy --json -e preview
```

Note: `edgeone makers deploy` automatically runs build before deploying — no separate `edgeone makers build` step needed.

### Build behavior

The CLI runs the configured build and uploads its output. When a framework needs a platform adapter or a non-default output directory, follow makers-frameworks first; local preview success does not prove the deployment contract is satisfied.

---

## Anonymous Deploy (no login required)

When explicitly unauthed and using no account credential, the user can choose login-free deployment and later claim the project. This Skill requires CLI `>= 1.7.0` for that flow too. If the baseline package is not available, stop; do not replace it with an older CLI, token flow or a different target.

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

A non-zero listener exit does not prove the project is unclaimed: a remote claim may have completed before local persistence failed. Check effective identity, current directory association and the confirmed project's remote ownership through supported CLI/tools without extracting tokens. Do not relaunch login, redeploy or replay a possibly consumed result while status is uncertain. Only after confirming that the original claim did not complete and the user still wants it should a fresh listener/link be created.

If the user asks you to "帮我认领" / "claim it for me": share the same link while the listener is active. If it ended, verify original status first as above; do not assume expiry means no remote completion. Never print the CLI claim command — `makers claim` remains a supported headless/CI route, not a desktop user's terminal instruction.

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
| CLI version < 1.7.0 | Upgrade with `npm install -g edgeone@latest` and verify. If the required release is not available yet, report it and stop rather than repeatedly installing or continuing with old commands |
| Required workspace/JSON/link/anonymous flags missing | Verify the actual binary path and installed package version; this Skill requires CLI ≥ 1.7.0 with those capabilities. An unavailable public release is not solved by repeated installs, legacy flags or token fallbacks |
| Browser does not open during login | Display the original waiting link and verify whether CLI or host owns browser opening; do not start a second login solely on elapsed time |
| Explicit authenticated=false / legacy text "not authenticated" | Complete supported agent login; exit 1 alone is not proof of missing credentials |
| authenticated=null / service or local-file error | Report safe cause and retry only the failed verification when appropriate; do not relogin automatically |
| Non-interactive deploy says "browser login is unavailable" | Desktop Skill: targeted workspace use with agent interaction, complete authentication and retry the original task. Browserless CI: safely injected credentials; do not silently switch project targets |
| Deploy seems to hang at `[DeployStatus] Deploying...` | Non-TTY emits heartbeat lines; it is NOT stuck. If a wrapper still mis-detects, use `--json` or run in background and poll. Do not kill it |
| Auth error with token | Token may be expired — regenerate at the console |
| Login appears successful but deployment/identity has a different target | Verify same-directory effective identity, explicit credential sources and original project binding. Pending selection is not completed login; do not guess browser session reuse or delete auth files |
| `edgeone whoami` shows an unexpected account | Ask the user to confirm the intended account and credential source; use account switch only when authorized, not as workspace switching |
| Explicit project quota exceeded | Stop creating. Ask the user to manage unused projects themselves or confirm an existing project in the intended workspace; verify and link that target first. Do not delete projects or pass another name to bypass a bound directory. A generic creation error alone does not prove quota exhaustion |
| PROJECT_ALREADY_EXISTS | Creation was refused; verify the existing project's ownership, then ask whether to link it or confirm another name. Never switch modes automatically |
| PROJECT_NOT_FOUND | Confirm the target name/workspace; linking an existing project does not authorize creation |
| PROJECT_LOOKUP_FAILED | Query failed, not proof of absence; do not create a replacement |
| LINK_CANCELLED | Respect cancellation and stop; generic legacy errors are not evidence of user cancellation |
| Build failure | Check logs — usually missing deps or bad build script |
| Login returned choices / already_logged_in, but target not verified | Follow the shared distinction: complete original pending login, or workspace use for an authenticated account. Never extract a token from cache or repeatedly replay a consumed result |
| `makers dev` requires linking or asks to create | Stop the blocked preview, confirm target and creation policy, explicitly link first, then restart dev preserving env. Do not use a name as permission to create or change an existing directory target |
| `curl` to the deploy URL returns 302 → DingTalk SSO login | Preview gateway requires browser-based `eo_token` validation (JS), which `curl` can't do. Open the full `?eo_token=...&eo_time=...` URL in a real browser — it validates the token and bypasses SSO. Not a code bug. |

---

For CLI command reference, environment variables, local dev setup, and token management details, see [references/command-reference.md](references/command-reference.md).
