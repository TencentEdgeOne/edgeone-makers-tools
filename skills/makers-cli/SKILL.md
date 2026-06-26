---
name: makers-cli
description: >-
  EdgeOne Makers CLI command reference.
  Use when running edgeone CLI commands for dev, build, deploy, env management.
bashPatterns:
  - "\\bedgeone\\s+"
metadata:
  author: edgeone
  version: "1.0.0"
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

## Package Scripts For Agent Projects

For projects that contain `agents/` plus a frontend, do not put `edgeone makers dev` in `package.json`'s `dev` script. The Makers CLI uses `npm run dev -- --port <port>` as the frontend dev server command, so `dev` must be a real frontend server:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "makers:dev": "PAGES_SOURCE=skills npx --yes edgeone makers dev",
    "makers:build": "PAGES_SOURCE=skills npx --yes edgeone makers build",
    "deploy": "PAGES_SOURCE=skills npx --yes edgeone makers deploy"
  }
}
```

Run `npm run makers:dev` to start Makers local development, then test through the Makers URL it prints (usually `http://localhost:8088`). Do not test Agent endpoints through the raw frontend port; that server only serves frontend assets.

## Common Workflows

### First-time setup
```bash
npm install -g edgeone
edgeone login
PAGES_SOURCE=skills edgeone makers link
PAGES_SOURCE=skills edgeone makers env pull
PAGES_SOURCE=skills edgeone makers dev
```

### Project script workflow
```bash
npm install
npm run makers:dev
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
