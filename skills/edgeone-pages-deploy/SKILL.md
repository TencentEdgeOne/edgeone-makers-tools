---
name: edgeone-pages-deploy
description: >-
  This skill deploys frontend and full-stack projects to EdgeOne Pages (Tencent EdgeOne).
  It should be used when the user's primary intent is to deploy, publish, ship, host, launch,
  go live, or release a new version — e.g. "deploy my app", "publish this site", "push this live",
  "create a preview deployment", "deploy to EdgeOne", "ship to production",
  "go live", "release", "publish a new version", "redeploy",
  "上线", "发布", "发一版", "重新部署".
  Do NOT trigger when deployment is only mentioned as a secondary step
  (e.g. "write an API and deploy it" — primary intent is writing code, use edgeone-pages-dev).
  Do NOT trigger for post-deployment runtime errors (e.g. CORS issues, 500 errors after deploy —
  use edgeone-pages-dev for troubleshooting).
metadata:
  author: edgeone
  version: "2.0.0"
---

# EdgeOne Pages Deployment Skill

Deploy any project to **EdgeOne Pages**.

## ⛔ Critical Rules (never skip)

1. **CLI version ≥ `1.2.30`** — reinstall if lower. Never proceed with an outdated version.
2. **Never truncate the deploy URL** — `EDGEONE_DEPLOY_URL` includes query parameters required for access. Always output the **complete** URL.
3. **Ask the user to choose China or Global site** before login. Never assume.
4. **Auto-detect the login method** — browser login in desktop environments, token login in headless/remote/CI environments. Follow the decision table below.
5. **After token login, ask if the user wants to save the token locally** for future use.
6. **Before triggering any browser popup (login / registration), explain the reason and the benefits to the user first** — never silently launch a browser window.

---

## Environment Setup

Before executing **any** `edgeone` CLI command (install, login, deploy, etc.), set the following environment variable in the current shell session:

```bash
export PAGES_SOURCE=skills
```

Or prefix each command inline:

```bash
PAGES_SOURCE=skills edgeone pages deploy
```

This tells the platform that the deployment is triggered from an AI skill context.

---

## Deployment Flow

Run these checks first, then follow the decision table:

```bash
# Check 0: Set environment variable (required before any edgeone command)
export PAGES_SOURCE=skills

# Check 1: CLI installed and correct version?
edgeone -v

# Check 2: Already logged in?
edgeone whoami

# Check 3: Project already linked?
cat edgeone.json 2>/dev/null

# Check 4: Saved token exists?
cat .edgeone/.token 2>/dev/null
```

### Decision Table

| CLI version | Login status | Action |
|-------------|-------------|--------|
| Not installed or < 1.2.30 | — | → Go to **Install CLI** |
| `≥ 1.2.30` ✓ | Logged in | → Go to **Deploy** |
| `≥ 1.2.30` ✓ | Not logged in, has saved token | → Go to **Deploy with Token** (use saved token) |
| `≥ 1.2.30` ✓ | Not logged in, no saved token | → Go to **Login** |

---

## Install CLI

```bash
npm install -g edgeone@latest
```

Verify: `edgeone -v` — confirm output is `1.2.30` or higher. Retry installation if not.

---

## Login

### 0. Explain the registration/login step

Before triggering any login flow, explain to the user **why** this step is needed and **what** to expect. Do not silently launch a browser window.

Tell the user:

> You need to log in or register an EdgeOne Pages account. Here's what to expect:
> - **Why login is required**: Deployment uploads your build output to your own account, generating a unique access URL and project record.
> - **What you get for free**: EdgeOne Pages offers a free tier with global CDN acceleration, automatic HTTPS, and custom domain binding — typically more than enough for personal projects.
> - **What happens next**: I'll run `edgeone login`, and your default browser will open the Tencent Cloud login page. Please complete the login/registration and authorize access, then come back here.
> - **If you get stuck**: If the browser doesn't open, or the CLI keeps waiting after you've logged in, let me know — I'll switch to Token login instead.

If the user does not respond for an extended period (e.g., more than 1–2 minutes), **proactively ask** about their status (whether the browser opened, any errors, or if they want to switch to Token login). Do not wait indefinitely.

### 1. Ask the user to choose a site

Use the IDE's selection control (`ask_followup_question`) before running any login command:

> Choose your EdgeOne Pages site:
> - **China** — For users in mainland China (console.cloud.tencent.com)
> - **Global** — For users outside China (console.intl.cloud.tencent.com)

### 2. Detect environment and choose login method

| Condition | Method |
|-----------|--------|
| Local desktop IDE (VS Code, Cursor, etc.) | **Browser Login** |
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

Token login does **NOT** use `edgeone login` or `edgeone whoami`. Pass the token directly in the deploy command via `-t`.

⚠️ **Important**: `edgeone whoami` does NOT support a `-t` flag. Do NOT attempt to verify a token with `whoami -t <token>`. The token is validated by the deploy command itself (`edgeone pages deploy -t <token>`). When the user provides a token, skip Check 2 (login status) entirely and go straight to **Deploy with Token**.

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

### Browser-authenticated deploy

```bash
# Project already linked (edgeone.json exists)
edgeone pages deploy

# New project (no edgeone.json)
edgeone pages deploy -n <project-name>
```

`<project-name>`: auto-generate from the project directory name. The first deploy creates `edgeone.json` automatically.

### Token-based deploy

First check for a saved token:

```bash
cat .edgeone/.token 2>/dev/null
```

- Saved token found → use it, tell the user: "Using saved token from `.edgeone/.token`"
- No saved token → ask the user to provide one (see Token Login above)

```bash
# Project already linked
edgeone pages deploy -t <token>

# New project
edgeone pages deploy -n <project-name> -t <token>
```

The token already contains site info — no `--site` flag needed.

After a successful deploy with a manually-entered token, ask if the user wants to save it (see "Offer to save the token locally" above).

### Deploy to preview environment

```bash
edgeone pages deploy -e preview
```

### Build behavior

The CLI auto-detects the framework, runs the build, and uploads the output directory. No manual config needed.

---

## ⚠️ Parse Deploy Output (Critical)

After `edgeone pages deploy` succeeds, the CLI outputs:

```
[cli][✔] Deploy Success
EDGEONE_DEPLOY_URL=https://my-project-abc123.edgeone.cool?<auth_query_params>
EDGEONE_DEPLOY_TYPE=preset
EDGEONE_PROJECT_ID=pages-xxxxxxxx
[cli][✔] You can view your deployment in the EdgeOne Pages Console at:
https://console.cloud.tencent.com/edgeone/pages/project/pages-xxxxxxxx/deployment/xxxxxxx
```

**Extraction rules:**

| Field | How to extract | ⛔ Warning |
|-------|---------------|-----------|
| **Access URL** | Full value after `EDGEONE_DEPLOY_URL=` | **Include the full query string** (`?` and everything after) — without these params the page will not load |
| **Project ID** | Value after `EDGEONE_PROJECT_ID=` | — |
| **Console URL** | Line after "You can view your deployment..." | — |

**Show the user:**

> ✅ Deployment complete!
> - **Access URL**: `https://my-project-abc123.edgeone.cool?<auth_query_params>`
> - **Console URL**: `https://console.cloud.tencent.com/edgeone/pages/project/...`
>
> ℹ️ Note: This preview URL is for quick deployment verification. When accessed from mainland China, the link may become restricted (e.g., 401) after some time or when shared, due to domain ICP filing status or CDN acceleration policies. For long-term stable public access, bind a custom domain with proper ICP filing.

---

## Error Handling

| Error | Solution |
|-------|----------|
| `command not found: edgeone` | Run `npm install -g edgeone@latest` |
| Browser does not open during login | Switch to token login |
| "not logged in" error | Run `edgeone whoami` to check, then re-login or use token |
| Auth error with token | Token may be expired — regenerate at the console |
| Login appears successful but `deploy` reports auth error | Browser reused a session from the wrong site, binding the wrong account. Click "Sign in with a different account" on the login page, or log out from all Tencent Cloud consoles first |
| `edgeone whoami` shows an unexpected account | Same issue: browser session reuse. Click "Sign in with a different account" or log out from all consoles and re-login |
| Project name conflict | Use a different name with `-n` |
| Build failure | Check logs — usually missing deps or bad build script |

---

For CLI command reference, environment variables, local dev setup, and token management details, see [references/command-reference.md](references/command-reference.md).
