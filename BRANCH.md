# `skillhub` branch

This branch is the **publishing branch** for CodeBuddy plugin marketplace and
SkillHub. Its **only** difference from `main` is that the root `SKILL.md`
carries a valid YAML frontmatter combining two sets of fields:

- **SkillHub fields** (`slug`, `displayName`, `version`, `summary`, `license`) —
  required by SkillHub's CLI (`skillhub publish`).
- **Claude Code / npx skills fields** (`name`, `description`) — required by
  `npx skills add` and CodeBuddy plugin marketplace.

YAML frontmatter is key-value, both sets coexist without conflict — each tool
reads only the keys it knows.

## Why a separate branch?

`npx skills add` (vercel-labs/skills CLI, v1.5.x) and CodeBuddy / SkillHub
disagree on what the root `SKILL.md` should contain:

| Tool | Root `SKILL.md` requirement |
|------|----------------------------|
| `npx skills add` | Must **not** have valid frontmatter, otherwise it shadows `skills/<name>/SKILL.md` and only the root is installed (and from a git remote, sub-directories are not copied). |
| CodeBuddy / SkillHub | Must have valid frontmatter with `name` field, otherwise upload/install fails with "missing name". |

→ `main` keeps the no-frontmatter root SKILL.md (so `npx skills add` installs
the 9 sub-skills correctly).
→ `skillhub` adds frontmatter on top (so CodeBuddy / SkillHub accept it).

## Maintenance flow

1. All development happens on `main` (or feature branches → `main`).
2. Before publishing to CodeBuddy / SkillHub, sync `main` into `skillhub`:

   ```bash
   git checkout skillhub
   git merge main          # or: git rebase main
   # The only conflict (if any) is on root SKILL.md frontmatter — keep skillhub's frontmatter, take main's body.
   git push origin skillhub
   ```

3. Publish from `skillhub` to CodeBuddy / SkillHub.

## Install commands

| Target | Command / Source |
|--------|------------------|
| `npx skills add` (Claude Code / Cursor / Codex / CodeBuddy CLI …) | `npx skills add TencentEdgeOne/edgeone-makers-tools` — uses `main` |
| CodeBuddy plugin marketplace | Install `edgeone-makers-tools` — backed by `skillhub` |
| SkillHub | Upload `skillhub` branch as the source |
