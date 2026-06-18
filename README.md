# EdgeOne Makers Tools

Official AI Agent Skills for developing and deploying projects on [EdgeOne Makers](https://pages.edgeone.ai/).

## Installation

```bash
npx skills add TencentEdgeOne/edgeone-makers-tools
```

After installation, your AI coding agent will automatically detect relevant tasks and load the right skill.

## Skills

| Skill | Description |
|-------|-------------|
| `makers-agents` | AI Agent development (DeepAgents, LangGraph, Claude SDK, OpenAI Agents, CrewAI) |
| `makers-deploy` | Deploy projects to EdgeOne |
| `makers-edge-functions` | Edge Functions (V8 lightweight runtime) |
| `makers-cloud-functions` | Cloud Functions (Node.js / Go / Python) |
| `makers-storage` | KV + Blob Storage |
| `makers-middleware` | Middleware (auth, rewrites, routing) |
| `makers-cli` | CLI command reference |
| `makers-recipes` | Project structure templates & scaffolding |

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

```
skills/
├── makers-agents/               # AI Agent development
│   ├── SKILL.md                 # Decision tree, red lines, framework routing
│   └── references/
│       ├── platform/            # Entry conventions, env, SSE protocol
│       ├── capabilities/        # Store, sandbox, tools
│       ├── node-frameworks/     # Claude SDK, LangGraph, OpenAI Agents, DeepAgents
│       └── python-frameworks/   # Claude SDK, LangGraph, OpenAI Agents, DeepAgents, CrewAI
├── makers-deploy/               # Deployment workflow
│   ├── SKILL.md
│   └── references/
├── makers-edge-functions/       # V8 edge runtime
│   └── SKILL.md
├── makers-cloud-functions/      # Node.js / Go / Python
│   ├── SKILL.md
│   └── references/
├── makers-storage/              # KV + Blob storage
│   └── SKILL.md
├── makers-middleware/           # Request interception
│   └── SKILL.md
├── makers-cli/                  # CLI commands
│   └── SKILL.md
└── makers-recipes/              # Project templates
    └── SKILL.md
```

Each skill follows the [skill-creator](https://github.com/anthropics/skills) standard:
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
