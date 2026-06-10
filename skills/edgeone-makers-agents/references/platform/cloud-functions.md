# agents/ vs cloud-functions/ Convention

> Covers: separation of AI inference (agents/) from data CRUD (cloud-functions/), layout, storage dependencies, store entry point differences.

---
## 5. cloud-functions Convention (Data Persistence)

### Principle
- Separate from `agents/`: `agents/` handles AI, `cloud-functions/` handles data CRUD
- One directory per resource: `cloud-functions/<resource>/index.ts`
- Returns JSON (no streaming); used for KV / Blob / preferences / health checks

### Example layout
```
cloud-functions/
├── _logger.ts
├── health/index.ts          → GET /health
├── articles/index.ts        → article CRUD
└── preferences/index.ts     → user preference read/write
```

### Storage dependencies
- KV/Blob: `@edgeone/pages-blob` (see content-creator's package.json)
- Access conversation-scoped storage via `context.store`

---
