# Command Reference

## Contents

- [Edge/Node Functions Initialization](#edgenode-functions-initialization)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Project Linking](#project-linking)
- [Token Management](#token-management)
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
edgeone makers env add KEY val # Add
edgeone makers env rm KEY      # Remove
```

## Project Linking

Read the [deployment login entry](makers-deploy.md#login), which routes to the single makers-cli login/workspace flow, before authentication, switching or changing a target. Standalone native CLI is supported; MCP is optional. `.edgeone/project.json` is the association, not `edgeone.json`.

```bash
# After confirming the existing target and actual workspace
edgeone makers link --name <project> --mode link_existing --skip-env-sync --expected-workspace <workspaceId> --json
```

Creating instead requires explicit creation consent and create_upload mode. Do not delete the association or create in another directory to bypass it.

## Token Management

Credentials are managed by CLI or securely injected into the process environment. Do not read or copy its private cache or write a separate token file. Global workspace switching does not replace an explicit environment or project-local credential; verify effective identity in the original directory and ask before changing its source. Local persistence is opt-in, not a sandbox permission workaround. See the shared flow for one-use result handling after failed approval re-runs.

## Full Command Reference (Makers)

| Action | Command |
|--------|---------|
| Install CLI | `npm install -g edgeone@latest` |
| Check version | `edgeone -v` (require ≥ 1.7.0 for all CLI execution; if the public package is unavailable, stop and explain rather than retrying installs) |
| Login (desktop, unknown target) | `edgeone login --interaction agent` |
| Login (China, explicit site) | `edgeone login --site china --interaction agent` |
| Login (Global, explicit site) | `edgeone login --site global --interaction agent` |
| Complete pending login | `edgeone login --interaction agent --session <sessionId> --workspace <workspaceId>` |
| Choose workspace | `edgeone workspace use --interaction agent` |
| Switch/confirm workspace | `edgeone workspace use <workspaceId> --interaction agent` |
| Continue pending switch | `edgeone workspace use <workspaceId> --interaction agent --session <sessionId>` |
| Discover workspaces | `edgeone workspace ls --json` |
| Login + claim anonymous project | `edgeone login --claim --local --json` (run in background after an anonymous deploy; prints `claimLoginUrl`, then waits) |
| View login info | `edgeone whoami --json` after verifying CLI ≥ 1.7.0 and actual JSON capability |
| Logout (only when requested, not workspace switching) | `edgeone logout` |
| Switch account | `edgeone switch --interaction agent` |
| Init functions | `edgeone makers init` |
| Local dev | `edgeone makers dev` |
| Link project | `edgeone makers link` |
| Link (non-interactive) | `edgeone makers link --name <project> -t <token>` |
| Deploy | `edgeone makers deploy` |
| Deploy new project | `edgeone makers deploy -n <name>` |
| Deploy preview | `edgeone makers deploy -e preview` |
| Deploy with token | `edgeone makers deploy -t <token>` |
| Deploy (JSON, Agent/CI) | `edgeone makers deploy -n <name> -t <token> --json` |
| Deploy anonymously (no login) | `edgeone makers deploy --anonymous --json` |
| Deploy anonymously to a site | `edgeone makers deploy --anonymous --site china\|global --json` |
| Claim an anonymous project | `edgeone makers claim --sid <anonymous-token> --json` |

## Makers Commands (Agent Projects)

For projects with `agents/` directory (AI Agent endpoints). `edgeone makers` commands auto-handle agent runtime build.

| Action | Command |
|--------|---------|
| Makers dev (interactive) | `edgeone makers dev` |
| Makers dev (non-interactive) | `edgeone makers dev --name <project> --skip-env-sync -t <token>` |
| Makers dev (custom port) | `edgeone makers dev --port 3000` |
| Makers link | `edgeone makers link --name <project> -t <token>` |
| Makers deploy | `edgeone makers deploy -n <name> -t <token>` |
| Makers deploy (JSON) | `edgeone makers deploy -n <name> -t <token> --json` |
| Makers deploy (preview) | `edgeone makers deploy -n <name> -t <token> --json -e preview` |
| Makers env pull | `edgeone makers env pull -t <token>` |
| Makers env set | `edgeone makers env set <KEY> <VALUE>` |

## Non-Interactive Flags

| Flag | Applies to | Purpose |
|------|-----------|---------|
| `--name <project>` / `-n` | dev, link, deploy | Skip interactive project selection |
| `--skip-env-sync` | dev | Skip "sync env vars?" prompt |
| `-t <token>` | dev, link, deploy, env | Token auth (skip browser login) |
| `--json` | deploy | Machine-readable JSON output (single line) |
| `--port <number>` | dev | Custom frontend port |
| `-e preview\|production` | deploy | Target environment |
| `--anonymous` | deploy | Deploy without login; ignored when already authenticated. No `-a` short form (taken by `--area`) |
| `--site china\|global` | deploy (with `--anonymous`), login | Target API site; auto-detected by IP when omitted |
| `--sid <token>` | claim | Anonymous identity token; optional when `.edgeone/anonymous.json` exists. **Not** the same as `-t` |

**Credential precedence** is resolved by CLI: explicit argument / environment, project-local auth, then global login. Directory association may select its owning workspace for project operations. The flag examples describe syntax only, not permission to expose tokens in chat or command logs; prefer secure environment injection and preserve existing sources unless the user authorizes a change.

## Anonymous Deploy

For login-free deployment and the claim flow, see [makers-deploy-anonymous-deploy.md](makers-deploy-anonymous-deploy.md).
