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

```bash
edgeone makers link
edgeone makers link --name <project> -t <token>   # Non-interactive
```

## Token Management

| Task | How |
|------|-----|
| Save token | Stored in `.edgeone/.token` (auto-added to `.gitignore`) |
| Update token | Delete `.edgeone/.token`, then deploy again — prompted to enter and save a new one |
| Use saved token | Automatic — the agent reads `.edgeone/.token` before each token deploy |

## Full Command Reference (Makers)

| Action | Command |
|--------|---------|
| Install CLI | `npm install -g edgeone@latest` |
| Check version | `edgeone -v` (require ≥ 1.6.0; anonymous deploy and `claim` need ≥ 1.6.29) |
| Login (China, browser) | `edgeone login --site china` |
| Login (Global, browser) | `edgeone login --site global` |
| Login (token, auto-site) | `edgeone login --token <token>` |
| Login + claim anonymous project | `edgeone login --claim --local --json` (run in background after an anonymous deploy; prints `claimLoginUrl`, then waits) |
| View login info | `edgeone whoami` |
| Logout | `edgeone logout` |
| Switch account | `edgeone switch` |
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

**Token precedence** (highest to lowest):
1. `-t <token>` flag on the command
2. `EDGEONE_PAGES_API_TOKEN` environment variable
3. `.edgeone/.token` file (saved token)
4. Browser login state

## Anonymous Deploy

For login-free deployment and the claim flow, see [anonymous-deploy.md](anonymous-deploy.md).
