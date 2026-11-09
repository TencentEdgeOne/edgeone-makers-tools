---
name: edgeone-makers-cli
description: >-
  EdgeOne Makers CLI command reference.
  Use when running edgeone CLI commands for dev, build, deploy, env management.
metadata:
  author: edgeone
  version: "1.2.1"
---

# EdgeOne Makers CLI Reference

## Install

```bash
npm install -g edgeone@latest
```

**This Skill requires CLI `>= 1.7.0` for every CLI execution flow**, including local dev, build, login, switching, linking, env, authenticated deployment and anonymous deployment / claim. Check `edgeone -v` before the first CLI operation and upgrade if lower. Writing code or reading guidance does not require installing/upgrading CLI; local previews do not require authentication unless they use credentialed services.

**Release availability**: `1.7.0` is the planned public CLI baseline. If it is not yet available from the user's configured registry, or `@latest` still resolves below it, stop and explain that the required release is unavailable; do not repeatedly install, silently continue with an older CLI, switch registries without consent, or assume a local development build is publicly released. This Skill should be published after the public `1.7.0` package is available and verified.

Version alone is not proof of the invoked package's capabilities: verify the actual CLI on PATH. `login --help` must expose `--interaction`, `--workspace`, `--session`; explicit linking requires `makers link --help` with `--mode`, `link_existing`, `create_upload`, `--skip-env-sync`, `--expected-workspace`, and `--json`; `whoami --help` must expose `--json`. Missing capabilities after a reported version match require checking the installed package/path, not a legacy fallback, guessed flags or private credential files. An arbitrary exit 1 is never proof of missing login.

## Login, workspace switching and project targets

### Execution modes

- **Standalone Skill**: execute native CLI in the actual project root after setting `PAGES_SOURCE=skills`. MCP is optional; do not require an expert team, connector or MCP server. Keep `agent` interaction for user choices, not automatic paid-workspace selection.
- **When equivalent MCP tools are available**: use `account_info`, `edgeone_workspace` and `deploy_folder`; keep exact IDs internal. Native CLI remains available for actions without an equivalent tool. Missing MCP alone is not an error for standalone use.
- **Connector already authenticated**: do not repeat installation or browser login merely because a Skill starts. Connector auto is an explicit bootstrap policy, not this Skill's default and not permission to use its selected workspace. Handle `workspace_confirmation_required` by asking for a business target. Do not infer it from plan, order or current selection.

### Choose the correct action

| User intent | Native command | Effect |
|---|---|---|
| Login when unauthed, target unknown | `edgeone login --interaction agent` | Browser authentication, then conversation selection if required |
| Complete the pending login | `edgeone login --interaction agent --session <sessionId> --workspace <workspaceId>` | Uses the original one-use result in the original directory; normally no second browser login |
| List workspaces | `edgeone workspace ls --json` | Discover IDs, names and availability; do not use for silent first-login orchestration |
| Choose among current-account workspaces | `edgeone workspace use --interaction agent` | Returns neutral choices; without a sessionId this is not a pending browser login |
| Switch/confirm a known workspace | `edgeone workspace use <workspaceId> --interaction agent` | Verifies/reuses cached credentials; missing credentials trigger authentication for that target |
| Complete a pending workspace switch | `edgeone workspace use <workspaceId> --interaction agent --session <sessionId>` | Continue using the original returned result, in the same directory |
| Switch account | `edgeone switch --interaction agent` | New account authentication; not a workspace switch |

Use the exact chosen ID, not a guessed ID from a name. On `selection_required`, stop business operations and ask the user by available workspace names. If sessionId is present, retain it internally and continue with the matching command above. If absent, issue `workspace use` with the chosen ID without inventing a session. Browser waiting links or exit 0 are not login success. Verify the final result and effective identity before continuing the original task. `already_logged_in` does not confirm a workspace switch: do not repeatedly run `login --workspace` against an already-authenticated account; use `workspace use`. Do not logout as a normal switching strategy.

For a known target while unauthed, the login command may include `--workspace <workspaceId>`. For an account already authenticated, this is not a substitute for `workspace use`. Choose the site on the unified browser page when no site was specified; only add `--site china|global` for an explicit user choice. Do not guess site from the desired project area. Allow the normal browser opener; use `--no-browser` only when a confirmed host owns opening the link. Keep the browser callback listener alive until the CLI returns its final result.

### Verify identity and credentials

`edgeone whoami --json` is read-only: authenticated: true means authenticated; authenticated: false means explicitly unauthed; authenticated: null means verification failed. A network, service or local-file error must not trigger automatic relogin. Authentication success alone does not confirm a new business target. For an existing directory association, preserve its owning project/workspace; use cached owning-workspace credentials or targeted authentication as directed by the CLI, rather than re-linking to the global selection.

A global selection does not overwrite a local credential or shell token. After switching, verify the effective workspace in the same project directory. If it is still the old workspace, check only whether explicit environment credentials or local auth are in effect, without printing their contents; explain the mismatch and obtain consent to correct the credential source. Do not delete `.edgeone/auth.json`, alter an external token, or repeatedly relogin to bypass it. `--local` additionally persists credentials in the project and may also update global state; it is not local-only or a guarantee of avoiding home writes. Use it only when explicitly needed and authorized. Do not read or copy private credential caches, persist another `.edgeone/.token`, or print secrets. Browserless CI continues to use safely injected environment credentials with their corresponding region; do not force a browser or ask unattended jobs for a token in chat.

### Change the project's deployment target

`.edgeone/project.json` records the directory association; `edgeone.json` is application configuration. A global switch does not migrate that project. Ordinary redeployment omits replacement names. To send an existing local project to another workspace, confirm the target workspace/name and whether to link existing or create new, then switch/authenticate it. With MCP use `edgeone_workspace scope=project` or `edgeone_project_link`, including confirmed=true and the original linkedProject.ProjectId snapshot. Native CLI remains fully supported:

```bash
# Existing project in the confirmed workspace; does not create or pull env
edgeone makers link -n <projectName> --mode link_existing --skip-env-sync --expected-workspace <workspaceId> --json
# New project only after separate creation consent
edgeone makers link -n <projectName> --mode create_upload --skip-env-sync --expected-workspace <workspaceId> --json
```

Re-read the association before a change; stop if it changed since confirmation. Verify the saved target matches the command result before deploying. Preserve the original cloud project and data. Never delete/edit project.json or copy the project into another directory to bypass its association. `PROJECT_ALREADY_EXISTS`, `PROJECT_NOT_FOUND`, `PROJECT_LOOKUP_FAILED`, `LINK_CANCELLED` distinguish conflict, missing target, failed query and actual cancellation. Do not assume a network failure means absence, or automatically rename/change modes/retry creation. Pulling/overwriting env is a separate user-approved operation.

### Retry and approval boundaries

Use separate commands for identity check, login/switch, association and deployment. Do not pipe authentication or deployment into `tail`/`head` or chain unrelated actions behind it: retain the actual exit code and structured output. A host's approval may re-run an entire command after partial execution. If a one-use login result might already have been consumed, do not replay the consumed result or combine fresh browser login and resume into a repeatedly retried shell command. Inspect the effective identity first. If the selected workspace is already verified, continue without another login. Otherwise report the original safe failure and request the necessary approval/recovery; a genuinely missing/expired/consumed result needs a new user-authorized authentication flow. This guidance does not fix the CLI's consume-then-save failure and does not guarantee first-attempt success under file-policy denial. Never disable the sandbox or change file permissions to bypass a denial.

Keep customer messages concise: login link, neutral workspace names, concrete outcome. Do not expose sessionId/workspaceId, raw JSON, token paths or retry mechanics unless explicitly asked. The user need not say “continue” after making a choice; continue the original authorized task after verification.

## Commands

| Command | Description |
|---------|-------------|
| `edgeone makers dev` | Start local dev server (agent runtime + frontend) |
| `edgeone makers build` | Build agents + frontend into `.edgeone/` |
| `edgeone makers deploy` | Build and deploy to EdgeOne Makers |
| `edgeone makers deploy -n <name>` | Deploy as a new project |
| `edgeone makers deploy -t <token>` | Deploy with API token (CI/headless) |
| `edgeone makers deploy -e preview` | Deploy to preview environment |
| `edgeone makers deploy --anonymous --json` | Deploy without login; claim later (this Skill requires CLI ≥ 1.7.0) |
| `edgeone makers deploy --anonymous --site china\|global --json` | Anonymous deploy to a specific site (omit `--site` to auto-detect by IP) |
| `edgeone makers claim --sid <token>` | Claim an anonymously-deployed project (requires login) |
| `edgeone makers link` | Link local project to remote EdgeOne project |
| `edgeone makers env pull` | Pull remote env vars to local `.env` |
| `edgeone makers env set <KEY> <VALUE>` | Set a remote environment variable |
| `edgeone makers env ls` | List remote environment variables |
| `edgeone makers env rm <KEY>` | Remove a remote environment variable |
| `edgeone login` | Login (browser-based) |
| `edgeone login --site china` | Login to China site |
| `edgeone login --site global` | Login to Global site |
| `edgeone login --claim --local --json` | Background listener: prints the login+claim link for an anonymous deploy, then auto-links the claimed project |
| `edgeone whoami` | Check current login status |

> This Skill requires CLI `>= 1.7.0` for anonymous deploy and `claim` as well as other commands. The claim parameter is `--sid` (the anonymous token); `-t` is the account API token — they are different credentials. Tell the user the link expires in 60 minutes; never show the raw `expiresAt`. The claim link you present comes from `edgeone login --claim` (`claimLoginUrl`), not the bare `claimUrl` in the deploy JSON. Details: [makers-deploy/references/anonymous-deploy.md](../makers-deploy/references/anonymous-deploy.md).

## Environment Variable

Before any `edgeone` command, set:

```bash
export PAGES_SOURCE=skills
```

Or inline: `PAGES_SOURCE=skills edgeone makers dev`

## Common Workflows

### First-time setup

Install and check capabilities, then follow the login/target flow above; these are separate steps, not a script to run blindly. Pure local previews do not need login when they use no credentialed services. For cloud-backed work, wait for target confirmation and verified association before running dev. Pull env only after confirmation of the correct target and local overwrite.

```bash
export PAGES_SOURCE=skills
edgeone whoami --json
# If explicitly unauthed, complete agent login and user selection first
edgeone login --interaction agent
# After the desired project is confirmed and linked
edgeone makers dev --skip-env-sync
```

### Deploy
```bash
edgeone makers deploy
```

### Set env vars for production
```bash
edgeone makers env set WSA_API_KEY "your-key"
edgeone makers env set SUPABASE_URL "https://xxx.supabase.co"
```
