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
metadata:
  author: edgeone
  version: "1.0.4"
---

# EdgeOne Makers Skills

When you need EdgeOne Makers platform development guidance, read the matching Skill based on the task:

| Task | Read |
|------|------|
| AI Agent development (DeepAgents, LangGraph, Claude SDK, OpenAI Agents, CrewAI) | skills/makers-agents/SKILL.md |
| Deploy project to EdgeOne | skills/makers-deploy/SKILL.md |
| Edge Functions (V8 lightweight functions) | skills/makers-edge-functions/SKILL.md |
| Cloud Functions (Node.js / Go / Python APIs) | skills/makers-cloud-functions/SKILL.md |
| KV + Blob Storage | skills/makers-storage/SKILL.md |
| Persist dynamic data for a site (messages, uploads, votes, save-state) — **no database; use Blob** | skills/makers-storage/SKILL.md |
| Middleware (auth, rewrites, routing) | skills/makers-middleware/SKILL.md |
| CLI command reference | skills/makers-cli/SKILL.md |
| Project structure / scaffolding | skills/makers-recipes/SKILL.md |
| Environment adaptation (WorkBuddy / sandbox / CI) | skills/makers-env-adaption/SKILL.md |

⚠️ Only read the Skill relevant to the current task. Do not load all skills at once.
