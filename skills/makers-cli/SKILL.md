---
name: makers-cli
description: >-
  EdgeOne Makers CLI command reference.
  Use when running edgeone CLI commands for dev, build, deploy, env management.
metadata:
  author: edgeone
  version: "1.0.0"
---

# EdgeOne Makers CLI Reference

## Install

**Default — install from the npmmirror registry** (significantly faster for users in mainland China; the CLI package itself is identical on both registries):

```bash
npm install -g edgeone@latest --registry=https://registry.npmmirror.com
```

Verify: `edgeone -v` — output must be `1.6.7` or higher.

### If the mirror install fails → retry once against the official registry

npmmirror is a lazy-sync mirror, so a freshly published CLI version can lag behind by minutes. If the mirror install fails, or `edgeone -v` reports a version below `1.6.7`, fall back to the official registry:

```bash
npm install -g edgeone@latest --registry=https://registry.npmjs.org
```

Tell the user which registry you used and why before running the fallback. Do not silently retry more than once per registry.

### Install error reference

| Error | Cause | Action |
|-------|-------|--------|
| `ETIMEDOUT` / `ENOTFOUND` / `EAI_AGAIN` / `network` | Registry unreachable | Retry once on the other registry (see above) |
| `edgeone -v` < `1.6.7` after install | Mirror lag, or a stale global install | Retry on the official registry |
| `EACCES` / `permission denied` | No write access to the global prefix | Do NOT use `sudo` unprompted. Tell the user and suggest `npm config set prefix ~/.npm-global` (plus adding `~/.npm-global/bin` to PATH), or ask them to run the install themselves |
| `command not found: edgeone` right after a successful install | Global bin dir not on PATH | Report the npm global prefix (`npm prefix -g`) and ask the user to add its `bin/` to PATH |

> ⚠️ Version `>= 1.6.7` is required. Older versions hang on interactive prompts in Agent/CI/sandbox environments and lack `--json` output. Never proceed with an outdated version.

## Commands

| Command | Description |
|---------|-------------|
| `edgeone makers dev` | Start local dev server (agent runtime + frontend) |
| `edgeone makers build` | Build agents + frontend into `.edgeone/` |
| `edgeone makers deploy` | Build and deploy to EdgeOne Makers |
| `edgeone makers deploy -n <name>` | Deploy as a new project |
| `edgeone makers deploy -t <token>` | Deploy with API token (CI/headless) |
| `edgeone makers deploy -e preview` | Deploy to preview environment |
| `edgeone makers link` | Link local project to remote EdgeOne project |
| `edgeone makers env pull` | Pull remote env vars to local `.env` |
| `edgeone makers env set <KEY> <VALUE>` | Set a remote environment variable |
| `edgeone makers env ls` | List remote environment variables |
| `edgeone makers env rm <KEY>` | Remove a remote environment variable |
| `edgeone login` | Login (browser-based) |
| `edgeone login --site china` | Login to China site |
| `edgeone login --site global` | Login to Global site |
| `edgeone whoami` | Check current login status |

## Environment Variable

Before any `edgeone` command, set:

```bash
export PAGES_SOURCE=skills
```

Or inline: `PAGES_SOURCE=skills edgeone makers dev`

## Common Workflows

### First-time setup
```bash
npm install -g edgeone@latest --registry=https://registry.npmmirror.com
edgeone login
PAGES_SOURCE=skills edgeone makers link
PAGES_SOURCE=skills edgeone makers env pull
PAGES_SOURCE=skills edgeone makers dev
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
