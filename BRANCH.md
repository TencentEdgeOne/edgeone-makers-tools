# WorkBuddy publishing branch

`fix/workbuddy-flat-skill-layout` is the WorkBuddy publishing branch. All skill development stays on `main`; do not merge this publishing layout back into `main`.

## Package contract

The upload ZIP contains exactly one `edgeone-makers-tools/` directory:

- `SKILL.md` — latest main router, WorkBuddy market frontmatter, flat reference paths.
- `references/*.md` — all capability and supporting documents, with no nested directories or additional `SKILL.md` files.

WorkBuddy frontmatter requires top-level `name`, `display_name`, `display_name_en`, `description`, `description_zh`, `description_en`, `version`, and `author`. Keep the package version, root entry version, `metadata.version`, and `_meta.json.version` aligned. Current publishing version: `2.3.5`.

Specification: https://open.workbuddy.cn/docs/skill

## Synchronize from main

1. Fetch `origin/main`, switch to this branch, and merge `origin/main`. Preserve branch history; do not force-push or change `main`.
2. For skill-content conflicts, take the latest **main content**, then reapply the publishing layout. Never keep an older flat document merely to avoid a merge conflict.
3. Flatten each source document deterministically:
   - `references/<capability>/SKILL.md` → `references/<capability>.md`.
   - `references/<capability>/references/<path>.md` → `references/<capability>-<path-with-hyphens>.md`.
   - Example: `references/makers-agents/references/node-frameworks/claude-sdk.md` → `references/makers-agents-node-frameworks-claude-sdk.md`.
4. Rewrite document links and plain-text file paths, preserving anchors. Remove obsolete nested files and directories. Update the root router, repository instruction routes, and `_meta.json.files`.
5. Preserve all main capabilities and their CLI requirements. Bump the WorkBuddy version from the previous publishing version and keep all version fields aligned.
6. Run `npm run build` to validate the publishing layout/frontmatter and regenerate Cursor/Codex guides. Check local Markdown links, file-manifest parity, and document completeness against main.

## Build the upload ZIP

Run from the repository root:

```bash
npm run build
(cd skills && zip -r /tmp/edgeone-makers-tools-workbuddy-2.3.5.zip edgeone-makers-tools -x '*/.DS_Store')
```

Upload `/tmp/edgeone-makers-tools-workbuddy-2.3.5.zip` in the WorkBuddy open platform. Do not upload a whole-repository archive: plugin manifests, hooks, generated guides, repository metadata, and development scripts are not part of this skill package.

Local validation does not prove server-side acceptance or marketplace publication. Those require uploading the ZIP and completing WorkBuddy review.
