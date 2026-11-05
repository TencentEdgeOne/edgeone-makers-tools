---
name: edgeone-makers-cli
description: >-
  EdgeOne Makers CLI command reference.
  Use when running edgeone CLI commands for dev, build, deploy, env management,
  workspace selection, switching workspaces (工作站点), or diagnosing credential/linked-project mismatches.
metadata:
  author: edgeone
  version: "1.3.0"
---

# EdgeOne Makers CLI Reference

## Install

```bash
npm install -g edgeone
```

Verify: `edgeone -v` and inspect `edgeone login --help` for Agent protocol support. Only inspect workspace/use help when that command exists or workspace operations are requested. Unknown flags can be ignored by older CLIs, so passing a flag without an error is not proof of support. Ordinary legacy login is supported by the compatibility rules below; only workspace switching / Agent selection needs the new protocol. The first published version supporting the Agent selection protocol is not yet confirmed; do not treat a development branch's package version as a release floor.

## Workspaces and operation targets

Distinguish `--site china|global` (API endpoint), workspace / `ZoneId` (resource space), `--area global|overseas` (project acceleration area), and deployment/environment (production, preview, or env-variable environment). They are not interchangeable.

`edgeone workspace` is a top-level command, not under `edgeone makers`:

| Command | Meaning |
|---------|---------|
| `edgeone workspace ls` | List the current account's workspaces |
| `edgeone workspace use <workspace> --interaction agent` | Switch the global workspace using its ID or name |
| `edgeone workspace use --interaction agent` | Return workspaces for selection in the conversation |
| `edgeone whoami` | Show the effective credential's Workspace Name, Workspace ID, Plan and Status |
| `edgeone switch --interaction agent` | Switch accounts, not workspaces |

`workspace ls` marks `current` (effective credential), `cached` (locally stored credential, still subject to validation), and `linked (this directory)` (workspace owning this directory's project). `whoami` alone does not resolve a linked command's target.

Browser login uses a temporary token to list workspaces, then exchanges it for the selected workspace's API token. A list containing exactly one workspace is selected automatically only if it is usable. With multiple workspaces, ask the user in the conversation; never pick the first row or assume a default from name or plan, even if only one of several is usable. Unavailable workspaces remain visible but cannot be selected. With the same name on multiple workspaces, use the Workspace ID. No workspaces means enable/create one in the console, not invent one in the CLI.

The CLI caches credentials by `<region>:<ZoneId>`. Switching verifies a cached token; a missing or rejected cache requires browser login for the chosen workspace, which Agent mode supports without a terminal picker. An API token cannot mint another workspace's credential. Do not ask a person to copy/create another token just because the terminal is non-TTY. Token login is for a user who explicitly supplies/requests it, a genuinely unavailable browser callback, or unattended CI with pre-provisioned target credentials.

### Agent login and selection protocol

**On a CLI supporting the Agent protocol, every login, account switch and workspace switch executed by this skill MUST explicitly include `--interaction agent`.** Keep `PAGES_SOURCE=skills` on each invocation too; it is a fallback, not a substitute for the explicit flag. A connector's PTY does not imply a person can press arrow keys. `--interaction terminal` is for human terminal use, not this skill. Do not add `--interaction` to unrelated commands that do not support it. The ordinary-login exception for a legacy CLI is defined below, not a way to bypass required workspace selection.

Explain browser authentication before launching it. Ask for China/Global when needed, then run `edgeone login --site <china|global> --interaction agent` (add `--local` only when a project-local credential copy is intended). Keep the process alive while the user completes browser auth; relay the `waiting.loginUrl` to them. Do not restart login simply because browser authentication is still in progress.

Read structured status lines, not just the exit code: exit code 0 is not proof of login success. `waiting` means browser auth is pending; `selection_required` means ask the user before proceeding; `success` means the operation completed; `already_logged_in` means inspect the current credential/link rather than starting another login. `--json` alone does not enable Agent selection; claim's existing `--json` flow is separate.

On `selection_required`, `workspaces` contains `id`, `name`, `plan`, `available`, and `status`. Present names/plans/statuses using the conversation's selection control (`ask_followup_question` or the host equivalent), offer only available choices, and map the answer to its exact ID. If the host has an option limit, group/page the choices rather than silently omitting workspaces or assuming the first. Never expose credentials or make the user perform terminal selection.

| Response / operation | Next action |
|----------------------|-------------|
| `selection_required` with `sessionId` | After the user chooses, resume with `edgeone login --session <sessionId> --workspace <workspaceId> --interaction agent` in the same directory |
| `selection_required` without `sessionId` (already logged-in switch) | No sessionId is needed: run `edgeone workspace use <workspaceId> --interaction agent` after the user chooses |
| Known target / valid cache | Use the explicit Workspace ID; do not ask again if the user already resolved this operation's target |
| Selected switch without a valid cache | Relay the browser login link and wait for authentication; the named workspace is bound without another picker |

A first-login session is valid for 10 minutes and is single-use. The CLI privately stores the temporary token; only forward the session ID and selected workspace ID, never read or print the session file. If expired, cancelled, consumed, or authentication fails, explain the result and restart browser authentication only as needed; do not promise the old session remains reusable. `workspace use <workspaceId> --session <sessionId> --interaction agent` is also supported for resuming a switch's browser-login session. Claim's 60-minute window is not this 10-minute session.

Only after a completed login/switch, check effective identity and directory association, then continue the original task. Selecting a workspace is not permission to re-link a project, create a replacement, or override an exported/local credential.

### Legacy CLI compatibility

For ordinary login and continuing the existing project, do not require an upgrade solely because Agent flags are absent. Reuse an existing valid login, or use the legacy browser login flow with the known site; no workspace question is required when that flow completes without selection. The existing credential or legacy login result determines the workspace, not the skill choosing the first space. Do not promise a particular default workspace name/ID, infer access to other spaces, or move the project.

If the old parser ignores `--interaction agent`, ordinary login can retain it without gaining Agent behavior. If it rejects the option, omit only the unsupported `--interaction` flag for ordinary legacy login; keep source attribution and supported site/local options. This documented compatibility fallback is not permission to suppress auth/network errors or keep retrying a terminal picker.

For legacy output, use the actual success message and `whoami` to verify authentication, then preserve the existing directory link and continue. Do not require modern JSON/session fields, and skip workspace-list commands that the old CLI lacks. Keep existing general/feature-specific version floors for unrelated capabilities.

For workspace switching, choosing another space, or resuming Agent selection, require an upgrade to a build exposing the new protocol. If a legacy login reaches a multiple-workspace terminal picker or reports that terminal selection is required, stop before waiting for arrow keys; explain that this account needs the upgraded CLI. Never auto-select the first row, inject a fake workspace ID, or ask for another API token as a substitute.

### Directory links versus global selection

Read and parse `.edgeone/project.json`: `Name` and `ProjectId` identify the project; `ZoneId` records its owning workspace. A valid link needs a non-empty `ProjectId`; file existence alone is not proof. `edgeone.json` is build/runtime configuration, not the project link.

| Invocation | Target selection |
|------------|------------------|
| Linked `dev` / `env` / `deploy`, no explicit token | Follow the directory's linked workspace, using its cached credential or requesting login if needed |
| Unlinked create/link/new deploy | Use the effective credential's workspace; confirm the target before creating resources |
| `workspace use` | Change global selection only; it does not change `.edgeone/project.json` or `.edgeone/auth.json` |
| Deploy `-n` naming a different project from the link | Bypass the old link's workspace; resolve that name in the effective credential's workspace |
| Explicit `-t` or `EDGEONE_PAGES_API_TOKEN` | Keep the explicit credential; do not replace it with a linked-workspace cache |

To move this directory to another workspace, switch/select its credential, then re-link to the intended project. Re-linking can create a project and pull env vars; do not perform it merely to inspect a target. Never silently re-link an existing directory to make an auth error disappear. A different `-n` is a deliberate deployment target change, not a generic non-interactive flag for an already-linked directory.

For legacy links missing `ZoneId`, let the CLI resolve a visible project and persist its workspace. If not visible, select the owning workspace's credential and retry; the project may instead have been deleted. If the workspace is unknown, do not guess. A query failure is not proof the project does not exist. When a linked `ProjectId` is not visible to the effective token, do not silently create a replacement; report the mismatch and confirm the intended target.

Never add `--zone-id` to create/link/deploy or write `zone_id` into `edgeone.json` to select a workspace. Business requests follow the API token's binding; local metadata cannot override it. Let the CLI maintain association files and credential caches.

### Re-link this directory to another workspace

This changes the local directory's deployment target; it does not migrate the cloud project, its deployments, domains, storage or configuration. The original cloud project remains in workspace A. Projects with the same name in A and B have different `ProjectId` values.

Distinguish intent: inspecting B only needs the workspace list; switching global selection does not authorize re-linking. If the user wants this directory's future deploys in B, confirm the exact Workspace ID and project name, then use the following standard flow. For a temporary copy in B, prefer a separate directory so A's association remains intact.

Execute sequentially, not as an unconditional shell chain. Keep `PAGES_SOURCE=skills` on every invocation. Resolve any explicit/environment/local credential pointing to A with consent before linking.

```bash
PAGES_SOURCE=skills edgeone workspace use <workspaceBId> --interaction agent
PAGES_SOURCE=skills edgeone whoami
PAGES_SOURCE=skills edgeone makers link --name <projectInB>
cat .edgeone/project.json
PAGES_SOURCE=skills edgeone makers deploy --json
```

- Wait for completed authentication, including browser callback or conversation/session resume when required. Verify `whoami` reports B before running `link`; the old directory link must not supply its A credential for this operation.
- `link --name` replaces the local association, including for a same-name project in B. It can create a missing project and pull remote environment variables into `.env`; obtain consent for creation and environment changes before linking. Review `.env` when changing targets: old A-only variables can remain, and remote same-name variables can overwrite local values.
- Parse the resulting `Name`, non-empty `ProjectId` and `ZoneId`; they must match the confirmed B project and workspace. Use the known B ProjectId when available, not just the project name or `whoami`. On link failure or a missing/mismatched association, do not deploy or create another replacement; preserve the remaining state and report the failure. A remote project might already have been created before a later link failure, so inspect it before retrying creation.
- On a CLI with the re-link fix, a missing project-response `ZoneId` is resolved from the effective credential before saving. An invalid ProjectId or unresolved workspace leaves the old association unchanged. Only updates to the same ProjectId may retain an omitted ZoneId; a different project must not inherit A's workspace.
- Do not move, delete or hand-edit `.edgeone/project.json` as the normal workflow, and do not invent `--force`, `unlink` or `--zone-id` options. On an older build that retains A's ZoneId or cannot establish B's target, stop and request an upgrade to a build with the re-link fix. Its first published version is not confirmed; a local development version is not a release guarantee.
- A same-name `deploy -n` is not a re-link operation and can keep A's linked ProjectId. After verified re-linking, normal deploy follows B even if the global selection later returns to A.

### Credential sources and sandbox limits

For commands accepting tokens, native precedence is `-t <token>` → `EDGEONE_PAGES_API_TOKEN` → `<cwd>/.edgeone/auth.json` → global credentials in `~/.edgeone/`. Before falling back to local/global credentials, linked commands can adopt the linked workspace as described above. Do not print token contents while checking provenance.

The project's `.env` can load `EDGEONE_PAGES_API_TOKEN` or `EDGEONE_PAGES_API_REGION` into the CLI process, shadowing a fresh global login or workspace switch. Check whether these keys exist without printing their values; explain any mismatch and obtain consent before changing them. Repeating global login or adding `--local` cannot override a higher-priority environment token.

`.edgeone/auth.json` holds a single credential written by `login --local`. Global `workspace use` does not rewrite it. Do not assume a global switch replaces a local/exported credential. If a local credential shadows the intended target, explain the mismatch and resolve the local login with consent using the Agent flow; an already-valid login may return `already_logged_in` rather than rewrite `auth.json`. Never delete credentials or change an exported token as a silent fix; use an explicit token only when the user intends that authentication method.

`.edgeone/.token` is an optional agent-managed legacy file, not a native CLI login store. Never auto-promote it above an existing login or directory link. Reuse it only after confirming the intended workspace, pass it explicitly, and keep it out of logs and Git. Prefer CLI-managed login; do not scan hashed global credential files or implement another token cache. `logout` and account/token login clear workspace caches; do not clear them as a routine fix for a valid linked target.

## Commands

| Command | Description |
|---------|-------------|
| `edgeone makers dev` | Start local dev server (agent runtime + frontend) |
| `edgeone makers build` | Build agents + frontend into `.edgeone/` |
| `edgeone makers deploy` | Build and deploy to EdgeOne Makers |
| `edgeone makers deploy -n <name>` | Resolve a named target; a different name bypasses the old link's workspace |
| `edgeone makers deploy -t <token>` | Deploy with API token (CI/headless) |
| `edgeone makers deploy -e preview` | Deploy to preview environment |
| `edgeone makers deploy --anonymous --json` | Deploy without login; claim later (CLI ≥ 1.6.29) |
| `edgeone makers deploy --anonymous --site china\|global --json` | Anonymous deploy to a specific site (omit `--site` to auto-detect by IP) |
| `edgeone makers claim --sid <token>` | Claim an anonymously-deployed project (requires login) |
| `edgeone makers link` | Link local project to remote EdgeOne project |
| `edgeone makers env pull` | Pull remote env vars to local `.env` |
| `edgeone makers env set <KEY> <VALUE>` | Set a remote environment variable |
| `edgeone makers env ls` | List remote environment variables |
| `edgeone makers env rm <KEY>` | Remove a remote environment variable |
| `edgeone login --interaction agent` | Login (browser-based) |
| `edgeone login --interaction agent --site china` | Login to China site |
| `edgeone login --interaction agent --site global` | Login to Global site |
| `edgeone login --interaction agent --claim --local --json` | Background listener: prints the login+claim link for an anonymous deploy, then auto-links the claimed project |
| `edgeone whoami` | Show account and effective credential's workspace (not the directory-link override) |
| `edgeone workspace ls` | List current, cached and directory-linked workspaces |
| `edgeone workspace use [workspace] --interaction agent` | Switch global workspace by ID/name, or return choices for the conversation |
| `edgeone switch --interaction agent` | Switch accounts; handle pending workspace selection before continuing |
| `edgeone login --interaction agent --token <token> --local` | Persist a single target-workspace credential locally with consent |

> Anonymous deploy and `claim` require CLI `>= 1.6.29` (the general CLI floor is `1.6.0`). The claim parameter is `--sid` (the anonymous token); `-t` is the account API token — they are different credentials. Tell the user the link expires in 60 minutes; never show the raw `expiresAt`. The claim link you present comes from `edgeone login --interaction agent --claim` (`claimLoginUrl`), not the bare `claimUrl` in the deploy JSON. Details: [makers-deploy/references/anonymous-deploy.md](../skills/edgeone-makers-tools/references/makers-deploy/references/anonymous-deploy.md).

## Environment Variable

Before any `edgeone` command, set:

```bash
export PAGES_SOURCE=skills
```

Or inline: `PAGES_SOURCE=skills edgeone makers dev`

## Common Workflows

### First-time setup
Run these steps sequentially, not as an unconditional shell chain. After login, handle `waiting` / `selection_required` using the protocol above; only continue to workspace checks and linking after confirmed authentication. Keep an existing valid project link rather than running initial linking again.
```bash
export PAGES_SOURCE=skills
npm install -g edgeone
edgeone login --interaction agent --site <china|global>
edgeone workspace ls
edgeone makers link --name <project>
edgeone makers env pull
edgeone makers dev
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
