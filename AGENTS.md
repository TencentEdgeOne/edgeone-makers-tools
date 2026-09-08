# EdgeOne Makers Skills

These files are platform facts and hard constraints for a frontier model.
They are not a tutorial and not a permission script. Infer, then act.

## Operating contract

### Autonomy

Execute the request. Do not narrate version / login / eligibility checks, and do not ask whether to continue a step the user already asked for.

- Build or iterate → start `edgeone makers dev` and preview on HTTP. Do not ask "要预览吗？"
- Deploy / 上线 / 发布 is already in the request → deploy after a working preview. Do not wait for a second confirmation.
- You have the shell. Never print a command for the user to type unless the only remaining step is a browser login or claim.

### Clarification

Ask only when a wrong guess is expensive **and** the answer is not in the repo, the conversation, `whoami`, or the CLI.

Do **not** ask:

- China vs Global when `whoami` already bound a site, a token is in use, or the CLI can detect the site (anonymous deploy)
- Whether the project uses KV / Blob / AI Gateway when the workspace is readable — grep it
- Whether to save a token the user just provided — persist it and keep `.edgeone/` gitignored; `makers-deploy` has the command
- Whether to preview, or whether to deploy when they already said deploy

### Approval

Require an explicit user decision only for:

- Deleting or overwriting a production project they did not name
- Using a secret they have not provided
- Account-destructive actions

Do **not** require approval for: installing the CLI, `makers dev`, linking a new project named from the directory, login-free deploy when they asked to publish and are not logged in, saving credentials locally.

### Managed hosts

Some hosts run you inside a sandbox they own: the CLI is already there and a
short-lived credential is injected for you. On one of those, none of the credential
work above is yours. Do not sign in, do not install or upgrade the CLI, do not read or
write credential files, and do not pass a token on a command line. Such a host says so
in its own instructions and its tool layer refuses those commands anyway, so trying
them spends turns and returns nothing.

### Done

- Dev work is done when the preview is `http://127.0.0.1:8088/` via `edgeone makers dev` — never `file://`, never `python -m http.server` / `npx serve`.
- Deploy work is done when the user can click a complete `.edgeone.cool` URL (keep `?eo_token=` / `?eo_time=`). Then stop. Do not add a lecture.
- If a constraint blocks completion, quote the raw CLI error and the one unblock action. Do not stop to ask "要继续吗？"

Hard constraints that still apply: never truncate a deploy URL; never delete projects yourself; never hand-edit `.edgeone/agent-node/config.json`; Blob uses `getStore({ name, consistency: "strong" })`.

## Load one skill

| Task | Read |
|------|------|
| Web framework support — adapter, build output, 404, unsupported features | skills/edgeone-makers-tools/references/makers-frameworks/SKILL.md |
| AI Agent development (DeepAgents, LangGraph, Claude SDK, OpenAI Agents, CrewAI) | skills/edgeone-makers-tools/references/makers-agents/SKILL.md |
| Migrate an existing agent project to EdgeOne Makers | skills/edgeone-makers-tools/references/makers-migration/SKILL.md |
| Deploy to EdgeOne | skills/edgeone-makers-tools/references/makers-deploy/SKILL.md |
| Edge Functions (V8) | skills/edgeone-makers-tools/references/makers-edge-functions/SKILL.md |
| Cloud Functions (Node.js / Go / Python) | skills/edgeone-makers-tools/references/makers-cloud-functions/SKILL.md |
| KV + Blob, or persist dynamic site data (no database — use Blob) | skills/edgeone-makers-tools/references/makers-storage/SKILL.md |
| Middleware (auth, rewrites, routing) | skills/edgeone-makers-tools/references/makers-middleware/SKILL.md |
| CLI command reference | skills/edgeone-makers-tools/references/makers-cli/SKILL.md |
| Project structure / scaffolding | skills/edgeone-makers-tools/references/makers-recipes/SKILL.md |
| Environment adaptation (WorkBuddy / sandbox / CI) | skills/edgeone-makers-tools/references/makers-env-adaption/SKILL.md |

Read only the skill that matches the current task.
