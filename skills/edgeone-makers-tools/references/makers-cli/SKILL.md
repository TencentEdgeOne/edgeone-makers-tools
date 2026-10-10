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
npm install -g edgeone
```

Verify: `edgeone -v`

## Commands

| Command | Description |
|---------|-------------|
| `edgeone makers dev` | Start local dev server (agent runtime + frontend) |
| `edgeone makers build` | Build agents + frontend into `.edgeone/` |
| `edgeone makers deploy` | Build and deploy to EdgeOne Makers |
| `edgeone makers deploy -n <name>` | Deploy as a new project |
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
| `edgeone login` | Login (browser-based) |
| `edgeone login --site china` | Login to China site |
| `edgeone login --site global` | Login to Global site |
| `edgeone login --claim --local --json` | Background listener: prints the login+claim link for an anonymous deploy, then auto-links the claimed project |
| `edgeone whoami` | Check current login status |

> Anonymous deploy and `claim` require CLI `>= 1.6.29` (the general CLI floor is `1.6.0`). The claim parameter is `--sid` (the anonymous token); `-t` is the account API token — they are different credentials. Tell the user the link expires in 60 minutes; never show the raw `expiresAt`. The claim link you present comes from `edgeone login --claim` (`claimLoginUrl`), not the bare `claimUrl` in the deploy JSON. Details: [makers-deploy/references/anonymous-deploy.md](../makers-deploy/references/anonymous-deploy.md).

## Environment Variable

Before any `edgeone` command, set:

```bash
export PAGES_SOURCE=skills
```

Or inline: `PAGES_SOURCE=skills edgeone makers dev`

## Common Workflows

### First-time setup
```bash
npm install -g edgeone
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

## Typed config (`edgeone.config.ts`)

Write `edgeone.config.ts` with `defineConfig` from `@edgeone/types/config`:

```ts
// edgeone.config.ts
import { defineConfig } from '@edgeone/types/config';

export default defineConfig({
  outputDirectory: 'dist',
  buildCommand: 'npm run build',
  nodeVersion: '20',
});
```

`edgeone compile` transpiles `edgeone.config.ts` → `edgeone.json`; `edgeone schema`
writes `edgeone.schema.json` locally for IDE validation. The CLI is self-contained —
no need to install `@edgeone/types` just to run these commands.
