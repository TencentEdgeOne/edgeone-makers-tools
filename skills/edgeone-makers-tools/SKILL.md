---
name: "edgeone-makers-tools"
description: "EdgeOne Makers platform development router — the single entry point for building, storing data, and deploying on Tencent EdgeOne Makers. Trigger whenever the user develops, scaffolds, or deploys anything on EdgeOne Makers / EdgeOne Pages: AI agents (DeepAgents, LangGraph, CrewAI, OpenAI/Claude SDK), Cloud Functions (Node/Go/Python), Edge Functions (V8), KV + Blob storage, middleware, CLI usage, project scaffolding, and — importantly — persisting dynamic site data (messages, uploads, votes, save-state) where there is NO managed database, so Blob is used as the backend. Also trigger on \"deploy to EdgeOne\", \"上线\", \"发布\", \"部署到 EdgeOne\". This SKILL is a routing table; read only the sub-skill relevant to the current task, never all of them at once."
---

# EdgeOne Makers Skills

Executing any EdgeOne CLI command in this Skill requires CLI `>= 1.7.7`. Before execution, read `references/makers-cli/SKILL.md` for version/capability checks and release availability; if the required public package is not available yet, stop rather than repeatedly upgrading or falling back to old commands. Writing code or reading these guides alone does not require CLI installation. Standalone usage keeps `agent` interaction; MCP and expert teams are optional, not prerequisites.

Before any CLI deployment, follow `references/makers-cli/SKILL.md#deployment-platform-attribution`: verify deploy help exposes `--platform`, then pass the confirmed host label (or `skill-unknown`) on every deployment. Do not infer the host from a model or SDK; keep the legacy interaction marker separate from attribution.

When you need EdgeOne Makers platform development guidance, read the matching Skill based on the task:

| Task | Read |
|------|------|
| Web framework support — which adapter, build output, 404, and unsupported features (Next.js, Nuxt, Astro, SvelteKit, React Router, TanStack Start, Vike, Vite, Hugo) | references/makers-frameworks/SKILL.md |
| AI Agent development (DeepAgents, LangGraph, Claude SDK, OpenAI Agents, CrewAI) | references/makers-agents/SKILL.md |
| Migrate an existing agent project to EdgeOne Makers | references/makers-migration/SKILL.md |
| Deploy project to EdgeOne | references/makers-deploy/SKILL.md |
| Edge Functions (V8 lightweight functions) | references/makers-edge-functions/SKILL.md |
| Cloud Functions (Node.js / Go / Python APIs) | references/makers-cloud-functions/SKILL.md |
| KV + Blob Storage | references/makers-storage/SKILL.md |
| Persist dynamic data for a site (messages, uploads, votes, save-state) — **no database; use Blob** | references/makers-storage/SKILL.md |
| Middleware (auth, rewrites, routing) | references/makers-middleware/SKILL.md |
| CLI command reference | references/makers-cli/SKILL.md |
| Project structure / scaffolding | references/makers-recipes/SKILL.md |
| Environment adaptation (WorkBuddy / sandbox / CI) | references/makers-env-adaption/SKILL.md |

⚠️ Only read the Skill relevant to the current task. Do not load all skills at once.

A full-stack framework that needs a platform adapter previews correctly and deploys
broken without one, and no gate catches it — so when a request names a framework, read
`makers-frameworks` before writing the config.
