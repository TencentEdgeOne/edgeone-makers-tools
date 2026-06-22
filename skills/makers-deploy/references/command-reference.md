# Command Reference

## Edge/Node Functions Initialization

For projects needing server-side functions, run before first deploy:

```bash
edgeone pages init
```

Pure static projects skip this.

## Local Development

```bash
edgeone pages dev    # http://localhost:8088/
```

## Environment Variables

```bash
edgeone pages env ls          # List all
edgeone pages env pull        # Pull to local .env
edgeone pages env add KEY val # Add
edgeone pages env rm KEY      # Remove
```

## Project Linking

```bash
edgeone pages link
edgeone pages link --name <project> -t <token>   # Non-interactive
```

## Token Management

| Task | How |
|------|-----|
| Save token | Stored in `.edgeone/.token` (auto-added to `.gitignore`) |
| Update token | Delete `.edgeone/.token`, then deploy again — prompted to enter and save a new one |
| Use saved token | Automatic — the agent reads `.edgeone/.token` before each token deploy |

## Full Command Reference (Pages)

| Action | Command |
|--------|---------|
| Install CLI | `npm install -g edgeone@latest` |
| Check version | `edgeone -v` (require ≥ 1.6.0) |
| Login (China, browser) | `edgeone login --site china` |
| Login (Global, browser) | `edgeone login --site global` |
| Login (token, auto-site) | `edgeone login --token <token>` |
| View login info | `edgeone whoami` |
| Logout | `edgeone logout` |
| Switch account | `edgeone switch` |
| Init functions | `edgeone pages init` |
| Local dev | `edgeone pages dev` |
| Link project | `edgeone pages link` |
| Link (non-interactive) | `edgeone pages link --name <project> -t <token>` |
| Deploy | `edgeone pages deploy` |
| Deploy new project | `edgeone pages deploy -n <name>` |
| Deploy preview | `edgeone pages deploy -e preview` |
| Deploy with token | `edgeone pages deploy -t <token>` |
| Deploy (JSON, Agent/CI) | `edgeone pages deploy -n <name> -t <token> --json` |

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

**Token precedence** (highest to lowest):
1. `-t <token>` flag on the command
2. `EDGEONE_PAGES_API_TOKEN` environment variable
3. `.edgeone/.token` file (saved token)
4. Browser login state
