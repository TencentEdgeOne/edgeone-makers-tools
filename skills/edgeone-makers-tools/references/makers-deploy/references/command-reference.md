# Command Reference

## Contents

- [Edge/Node Functions Initialization](#edgenode-functions-initialization)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Project Linking](#project-linking)
- [Workspaces and Token Management](#workspaces-and-token-management)
- [Full Command Reference (Makers)](#full-command-reference-makers)
- [Makers Commands (Agent Projects)](#makers-commands-agent-projects)
- [Non-Interactive Flags](#non-interactive-flags)
- [Anonymous Deploy](#anonymous-deploy)

## Edge/Node Functions Initialization

For projects needing server-side functions, run before first deploy:

```bash
edgeone makers init
```

Pure static projects skip this.

## Local Development

```bash
edgeone makers dev    # http://localhost:8088/
```

## Environment Variables

```bash
edgeone makers env ls          # List all
edgeone makers env pull        # Pull to local .env
edgeone makers env set KEY val # Add or update
edgeone makers env rm KEY      # Remove
```

## Project Linking

```bash
edgeone makers link --name <project>             # Confirmed target, reuse completed login
edgeone makers link --name <project> -t <token>  # Only for explicit token intent
```

For an intentional cross-workspace re-link, follow [Deployment Flow](../SKILL.md#deployment-flow): finish switching, verify the effective workspace, run `edgeone makers link --name <projectInB>`, check the saved ProjectId/ZoneId, then deploy. Re-linking does not migrate the cloud project. It can create a missing project and change `.env`; obtain consent first. Do not rename/delete `project.json` or use a same-name `deploy -n` as the standard re-link operation.

## Workspaces and Token Management

Read [Deployment Flow](../SKILL.md#deployment-flow) for the canonical workspace/credential rules. Use `edgeone workspace ls` to inspect current/cached/linked workspaces and `edgeone workspace use --interaction agent <id-or-name>` to change global selection. Linked commands follow `.edgeone/project.json`; global switching does not re-link this directory or rewrite `.edgeone/auth.json`.

Login and switching MUST include `--interaction agent`; multi-workspace selection happens in the conversation. On `selection_required`, follow the parent Deployment Flow and its canonical CLI protocol: resume a returned session with the selected ID, or run the named workspace switch when no session is present. Do not treat exit 0 as authentication success or ask for another token just because there is no terminal. Use CLI-managed `edgeone login --interaction agent --token <target-workspace-token>` only for explicit token intent or genuinely unavailable browser authentication; add `--local` with consent for a project credential. `.edgeone/.token` is an optional legacy agent-managed file, not a CLI-native store. Do not automatically read/promote it over an existing login or link, and never print its value. See the canonical rules before reusing a saved credential.

## Full Command Reference (Makers)

| Action | Command |
|--------|---------|
| Install CLI | `npm install -g edgeone@latest` |
| Check version | `edgeone -v` (require ≥ 1.6.0; anonymous deploy and `claim` need ≥ 1.6.29) |
| Login (China, browser) | `edgeone login --interaction agent --site china` |
| Login (Global, browser) | `edgeone login --interaction agent --site global` |
| Login (token, auto-site) | `edgeone login --interaction agent --token <token>` |
| Login + claim anonymous project | `edgeone login --interaction agent --claim --local --json` (run in background after an anonymous deploy; prints `claimLoginUrl`, then waits) |
| View login info | `edgeone whoami` |
| Logout | `edgeone logout` |
| Switch account | `edgeone switch --interaction agent` |
| List workspaces | `edgeone workspace ls` |
| Switch global workspace | `edgeone workspace use <id-or-name> --interaction agent` (omit target to return choices for the conversation) |
| Resume first-login selection | `edgeone login --session <sessionId> --workspace <workspaceId> --interaction agent` (same directory) |
| Init functions | `edgeone makers init` |
| Local dev | `edgeone makers dev` |
| Link project | `edgeone makers link` |
| Link (non-interactive) | `edgeone makers link --name <project> -t <token>` |
| Deploy | `edgeone makers deploy` |
| Deploy new project | `edgeone makers deploy -n <name>` |
| Deploy preview | `edgeone makers deploy -e preview` |
| Deploy with token | `edgeone makers deploy -t <token>` |
| Deploy linked project (JSON, Agent/CI) | `edgeone makers deploy -t <target-workspace-token> --json` |
| Deploy anonymously (no login) | `edgeone makers deploy --anonymous --json` |
| Deploy anonymously to a site | `edgeone makers deploy --anonymous --site china\|global --json` |
| Claim an anonymous project | `edgeone makers claim --sid <anonymous-token> --json` |

## Makers Commands (Agent Projects)

For projects with `agents/` directory (AI Agent endpoints). `edgeone makers` commands auto-handle agent runtime build.

| Action | Command |
|--------|---------|
| Makers dev (interactive) | `edgeone makers dev` |
| Makers dev (linked, non-interactive) | `edgeone makers dev --skip-env-sync -t <token>` |
| Makers dev (custom port) | `edgeone makers dev --port 3000` |
| Makers link (confirmed initial target) | `edgeone makers link --name <project> -t <token>` |
| Makers deploy (linked) | `edgeone makers deploy -t <token>` |
| Makers deploy (linked, JSON) | `edgeone makers deploy -t <token> --json` |
| Makers deploy (linked, preview) | `edgeone makers deploy -t <token> --json -e preview` |
| Makers env pull | `edgeone makers env pull -t <token>` |
| Makers env set | `edgeone makers env set <KEY> <VALUE>` |

## Non-Interactive Flags

| Flag | Applies to | Purpose |
|------|-----------|---------|
| `--interaction agent` | login, switch, workspace use | Select in the conversation, not the terminal; required for skill calls |
| `--session <id>` | login, workspace use | Resume pending browser login in the same directory with selected Workspace ID |
| `--workspace <id>` | login | Bind the selected workspace; required with --session |
| `--name <project>` / `-n` | dev, link, deploy | Confirm initial/named target; a different deployment name bypasses the old workspace link. Omit for normal linked deploy |
| `--skip-env-sync` | dev | Skip "sync env vars?" prompt |
| `-t <token>` | dev, link, deploy, env | Token auth (skip browser login) |
| `--json` | deploy | Machine-readable JSON output (single line) |
| `--port <number>` | dev | Custom frontend port |
| `-e preview\|production` | deploy | Target environment |
| `--anonymous` | deploy | Deploy without login; ignored when already authenticated. No `-a` short form (taken by `--area`) |
| `--site china\|global` | deploy (with `--anonymous`), login | Target API site; auto-detected by IP when omitted |
| `--sid <token>` | claim | Anonymous identity token; optional when `.edgeone/anonymous.json` exists. **Not** the same as `-t` |

**Native token precedence**: `-t` → `EDGEONE_PAGES_API_TOKEN` → `.edgeone/auth.json` → global credentials. Linked `dev`/`env`/`deploy` can adopt their linked workspace before local/global fallback; explicit tokens are never replaced. See [Deployment Flow](../SKILL.md#deployment-flow) for the complete target decision table. A manually saved `.edgeone/.token` only applies when deliberately passed as an explicit token.

## Anonymous Deploy

For login-free deployment and the claim flow, see [anonymous-deploy.md](anonymous-deploy.md).
