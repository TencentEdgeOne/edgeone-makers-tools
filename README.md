# EdgeOne Makers

Official AI Agent Skills for developing and deploying projects on [EdgeOne Makers](https://pages.edgeone.ai/).

## Installation

### Option A — `npx skills` (Claude Code / Cursor / Codex / CodeBuddy CLI etc.)

```bash
npx skills add TencentEdgeOne/edgeone-makers-tools
```

This installs **one skill — `edgeone-makers-tools`** into your agent's skills
directory (`.codebuddy/skills/edgeone-makers-tools/`, `.claude/skills/edgeone-makers-tools/`,
`.cursor/skills/edgeone-makers-tools/`, …). Its `SKILL.md` is a router that loads the
matching capability under `references/` on demand — one skill in your list, full
coverage inside.

### Option B — CodeBuddy plugin marketplace / SkillHub

Search and install `edgeone-makers-tools` from the CodeBuddy plugin marketplace or
SkillHub. They register the same single `edgeone-makers-tools` skill.

### Option C — Claude Code plugin marketplace

```text
/plugin marketplace add TencentEdgeOne/edgeone-makers-tools
/plugin install edgeone-makers-tools@edgeone-makers
```

After installation, your AI coding agent will automatically detect relevant tasks and load the right skill.

## Capabilities

The single `edgeone-makers-tools` skill routes to these capabilities (each lives under `skills/edgeone-makers-tools/references/<name>/`):

| Capability | Description |
|-------|-------------|
| `makers-frameworks` | Web framework support matrix — platform adapters, build output, 404 conventions |
| `makers-agents` | AI Agent development (DeepAgents, LangGraph, Claude SDK, OpenAI Agents, CrewAI) |
| `makers-deploy` | Deploy projects to EdgeOne |
| `makers-edge-functions` | Edge Functions (V8 lightweight runtime) |
| `makers-cloud-functions` | Cloud Functions (Node.js / Go / Python) |
| `makers-storage` | KV + Blob Storage |
| `makers-middleware` | Middleware (auth, rewrites, routing) |
| `makers-cli` | CLI command reference |
| `makers-recipes` | Project structure templates & scaffolding |
| `makers-migration` | Migrate existing agent projects to EdgeOne Makers |
| `makers-env-adaption` | Environment adaptation (WorkBuddy / sandbox / CI) |

## Usage Examples

**Deployment:**

```
Deploy my project to EdgeOne
```

```
Deploy this Next.js project and give me the preview URL
```

**Development:**

```
Create an API for user registration
```

```
Write middleware to protect my /api routes with auth
```

```
Set up Edge Functions with KV storage for a page view counter
```

```
Create a Go API with Gin framework
```

**AI Agents:**

```
Build an AI chat agent on EdgeOne Makers
```

```
Wire LangGraph into my Makers project with checkpointer + store
```

```
Create a Claude Agent SDK endpoint with sandbox code execution
```

## Skill Structure

One skill, capabilities bundled as reference docs it routes to on demand:

```
skills/
└── edgeone-makers-tools/
    ├── SKILL.md                     # Router — matches the task, loads a capability below
    └── references/
        ├── makers-frameworks/       # Web framework support matrix
        │   ├── SKILL.md             # Adapter table + machine-readable profiles
        │   └── references/          # One document per framework
        ├── makers-agents/           # AI Agent development
        │   ├── SKILL.md             # Decision tree, red lines, framework routing
        │   └── references/
        │       ├── platform/        # Entry conventions, env, SSE protocol
        │       ├── capabilities/    # Store, sandbox, tools
        │       ├── node-frameworks/     # Claude SDK, LangGraph, OpenAI Agents, DeepAgents
        │       └── python-frameworks/   # Claude SDK, LangGraph, OpenAI Agents, DeepAgents, CrewAI
        ├── makers-deploy/           # Deployment workflow
        ├── makers-edge-functions/   # V8 edge runtime
        ├── makers-cloud-functions/  # Node.js / Go / Python
        ├── makers-storage/          # KV + Blob storage
        ├── makers-middleware/       # Request interception
        ├── makers-cli/              # CLI commands
        ├── makers-recipes/          # Project templates
        ├── makers-migration/        # Migrate existing agent projects
        └── makers-env-adaption/     # Sandbox / WorkBuddy / CI adaptation
```

The skill follows the [skill-creator](https://github.com/anthropics/skills) standard:
- `SKILL.md` — YAML frontmatter (name + description) + core instructions
- `references/` — detailed docs loaded on demand, routed from `SKILL.md`

## Multi-Platform Support

This repo includes plugin manifests for multiple AI platforms:
- `.claude-plugin/` — Claude Code
- `.cursor-plugin/` — Cursor
- `.codebuddy-plugin/` — CodeBuddy

Hooks (`hooks/`) provide context-aware skill injection via `UserPromptSubmit` and `PreToolUse` events.

## Requirements

- **Node.js** ≥ 16
- An EdgeOne account: [China site](https://console.cloud.tencent.com/edgeone/pages) | [Global site](https://pages.edgeone.ai)

## License

MIT
