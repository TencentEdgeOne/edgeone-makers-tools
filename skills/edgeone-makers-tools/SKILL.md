---
name: edgeone-makers-tools
description: >-
  EdgeOne Makers platform development router — the single entry point for building,
  storing data, and deploying on Tencent EdgeOne Makers. Trigger whenever the user
  develops, scaffolds, or deploys anything on EdgeOne Makers / EdgeOne Pages: AI agents
  (DeepAgents, LangGraph, CrewAI, OpenAI/Claude SDK), Cloud Functions (Node/Go/Python),
  Edge Functions (V8), KV + Blob storage, middleware, CLI usage, project scaffolding,
  and — importantly — persisting dynamic site data (messages, uploads, votes, save-state)
  where there is NO managed database, so Blob is used as the backend. Also trigger on
  "deploy to EdgeOne", "上线", "发布", "部署到 EdgeOne". This SKILL is a routing table;
  read only the sub-skill relevant to the current task, never all of them at once.
whenToUse: >-
  When the user develops, scaffolds, or deploys anything on EdgeOne Makers / EdgeOne Pages.
  Includes AI agent development, Cloud Functions, Edge Functions, KV/Blob storage,
  middleware, and deployment. Also trigger on "deploy to EdgeOne", "上线", "发布", "部署到 EdgeOne".
metadata:
  author: edgeone
  version: "2.1.0"
---

# EdgeOne Makers Skills

> 🔌 **Via the WorkBuddy EdgeOne connector?** The connector's `cli.json` preAuth has already installed the `edgeone` CLI, checked its version, and logged the user in **before you start** — do NOT create tasks or run commands to install/upgrade the CLI, check its version, or check/perform login. Go straight to build + deploy. (Standalone skill / CI use has no preAuth — there, verify per `references/makers-cli/SKILL.md` and `references/makers-deploy/SKILL.md`.)

When you need EdgeOne Makers platform development guidance, read the matching Skill based on the task:

| Task | Read |
|------|------|
| AI Agent development (DeepAgents, LangGraph, Claude SDK, OpenAI Agents, CrewAI) | references/makers-agents/SKILL.md |
| Deploy project to EdgeOne | references/makers-deploy/SKILL.md |
| Edge Functions (V8 lightweight functions) | references/makers-edge-functions/SKILL.md |
| Cloud Functions (Node.js / Go / Python APIs) | references/makers-cloud-functions/SKILL.md |
| KV + Blob Storage | references/makers-storage/SKILL.md |
| Persist dynamic data for a site (messages, uploads, votes, save-state) — **no database; use Blob** | references/makers-storage/SKILL.md |
| Middleware (auth, rewrites, routing) | references/makers-middleware/SKILL.md |
| CLI command reference | references/makers-cli/SKILL.md |
| Project structure / scaffolding | references/makers-recipes/SKILL.md |
| Environment adaptation (WorkBuddy / sandbox / CI) | references/makers-env-adaption/SKILL.md |

## ⚠️ Before writing any code (applies to every task)

These cross-cutting rules bite even pure static "develop + deploy" tasks — follow them no matter which sub-skill you loaded. Full detail in `references/makers-recipes/SKILL.md`.

- **Write `index.html` LAST.** Creating it instantly triggers the IDE `file://` preview (unavoidable in WorkBuddy). Write every dependency first — `style.css`, `script.js`, Cloud Functions (`functions/`), static assets — then `index.html` last, so the preview opens with all assets already in place. Write it in one shot; don't scaffold an empty shell and fill it in with repeated edits (every save re-renders and flickers). For a tiny single-page tool, inline the CSS/JS into one `index.html`.
- **Preview via the dev server (8088), then the live URL.** After development, run `edgeone makers dev` — it serves on `http://127.0.0.1:8088/` — and present that `127.0.0.1:8088` URL in the browser via `present_files`. After deploying, open and present the live deployment URL. (Blob/KV projects need `edgeone makers dev -n <project-name>`.)
- **Read `references/makers-recipes/SKILL.md` before scaffolding** for project structure and Cloud Function file-naming — a function file missing its `.js` / `.py` / `.go` extension is silently served as static HTML.

## Scripts (Quick Actions)

For common operations, run these scripts directly instead of manually composing CLI commands:

| Action | Script | Description |
|--------|--------|-------------|
| Install/upgrade CLI | `node references/makers-cli/scripts/install-cli.mjs` | Auto-selects fastest registry, idempotent |
| Deploy project | `node references/makers-deploy/scripts/deploy.mjs --name <project>` | Full pipeline: CLI check → auth → deploy → JSON output |
| Deploy to preview | `node references/makers-deploy/scripts/deploy.mjs --name <project> --preview` | Same as above, preview environment |

Scripts output structured JSON on stdout. Exit code 0 = success.

⚠️ Only read the Skill relevant to the current task. Do not load all skills at once.
