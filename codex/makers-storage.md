---
name: edgeone-makers-storage
description: >-
  KV and Blob storage services on EdgeOne Makers. KV for edge key-value pairs,
  Blob for file/object storage in Cloud Functions. Covers SDK usage, setup, and troubleshooting.
metadata:
  author: edgeone
  version: "1.0.0"
---

# EdgeOne Makers Storage

> 🗄️ **There is NO managed database on this platform** — no SQL, no MongoDB, no Prisma, no ORM. Do **not** reach for `sqlite`, `pg`, `mysql`, `mongodb`, or an in-memory array (it resets on every cold start / redeploy). **Blob IS your database.** Any dynamic data a generated site needs to persist — guestbook messages, uploaded drawings, votes, leaderboards, per-user save state, form submissions — is modeled as Blob keys. Model your "tables" as **key prefixes** (`messages/<id>.json`, `users/<uid>.json`). See [references/blob.md](references/blob.md) → "Blob as your backend".

> ⚠️ **Local dev does NOT always require login.** `edgeone makers dev` runs without authentication for **pure-static** previews. Login only becomes necessary through this chain: **using Blob ⇒ the project must be `link`ed ⇒ linking requires a logged-in account first.** So if (and only if) dev/deploy must read/write **Blob** (or any credentialed backend), run `edgeone login` (browser) or pass `-t <token>` before linking/starting dev. **If your site has no backend, skip login and just run `edgeone makers dev`.** See also makers-env-adaption (Login authentication + Project linking).
>
> ⛔ **When the project uses Blob/KV, ALWAYS pass `-n <project-name>` to `edgeone makers dev`.** Bare `edgeone makers dev` drops into an interactive "Link existing / Create and link" picker that hangs in sandbox / non-interactive environments. With `-n`, the CLI auto-creates the project if the name doesn't exist yet — one command, no separate step needed.

EdgeOne Makers provides two storage services. **Choose based on your runtime and data type:**

| Storage | Runtime | Data Type | SDK | Use Case |
|---------|---------|-----------|-----|----------|
| **KV** | Edge Functions only | Small key-value pairs (≤ 25 MB) | Global variable (no npm) | Counters, config, session tokens, simple CRUD |
| **Blob** | Cloud Functions (Makers Functions) | Files & objects (images, docs, uploads) | `@edgeone/pages-blob` (npm) | User uploads, AI-generated content, file management |

## Decision Tree

```
Need to persist anything (records, lists, counters, uploads, save state)?
├─ Edge Function (V8 runtime, no npm)?
│   → KV Storage (global variable)           → read references/kv.md
└─ Cloud Function (Node.js, has npm)?  ← default for any real backend
    ├─ Files / images / large objects?
    │   → Blob Storage                       → read references/blob.md
    └─ Structured data (records, lists, counters, per-user state)?
        → Blob with setJSON / key prefixes   → read references/blob.md
```

## Routing

| Task | Read |
|------|------|
| KV Storage (Edge Functions, global variable, put/get/delete/list) | [references/kv.md](references/kv.md) |
| Blob Storage (Cloud Functions, npm SDK, file upload/download, pre-signed URLs) | [references/blob.md](references/blob.md) |
