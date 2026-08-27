---
name: edgeone-makers-types
description: >-
  TypeScript types for EdgeOne Makers — the official `@edgeone/types` package.
  Typed handler signatures (Agent / Cloud / Edge / Middleware) and typed project
  config (`edgeone.config.ts` via `@edgeone/types/config`). Use when writing .ts
  handler files, edgeone.config.ts, or when the user needs type safety /
  autocompletion for handlers or config on EdgeOne Makers.
pathPatterns:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/edgeone.config.ts"
metadata:
  author: edgeone
  version: "1.0.0"
---

# TypeScript types (@edgeone/types)

`@edgeone/types` is the official TypeScript types package for EdgeOne Makers — typed
handler signatures (Agent / Cloud / Edge / Middleware) plus project config types.
Install it as a devDependency for editor autocompletion and type safety.

## Install / 安装

```bash
npm install -D @edgeone/types
```

> Requires `Request` / `Response` types: include `"DOM"` in tsconfig `lib`, or use
> `@edgeone/ef-types` (the default in CLI init templates).
> 需要环境里有 `Request` / `Response` 类型：tsconfig `lib` 含 `"DOM"`，或使用
> `@edgeone/ef-types`（CLI init 模板默认配置）。

## Handler types / 函数 handler 类型

### Cloud / Node functions

```ts
// cloud-functions/api/search.ts
import type { CloudFunctionHandler } from '@edgeone/types';

export const onRequest: CloudFunctionHandler = async (context) => {
  const query = context.request?.query;
  return new Response(JSON.stringify({ query, region: context.server.region }));
};
```

Supports method-level handlers `onRequestGet/Post/Put/Delete/Patch/Head/Options` with the same signature.

### Agent

```ts
// agents/chat.ts
import type { AgentHandler } from '@edgeone/types';

export const onRequest: AgentHandler = async (context) => {
  await context.store.appendMessage({
    conversationId: context.conversation_id,
    role: 'user',
    content: 'hello',
  });
  return new Response('ok');
};
```

### Edge functions

```ts
// edge-functions/api/hello.ts
import type { EdgeFunctionHandler } from '@edgeone/types';

export const onRequest: EdgeFunctionHandler = (context) => {
  return new Response(JSON.stringify({ params: context.params, eo: context.eo }));
};
```

### Edge middleware

```ts
// middleware.ts (project root)
import type { EdgeMiddlewareConfig, EdgeMiddlewareHandler } from '@edgeone/types';

export const config: EdgeMiddlewareConfig = { matcher: ['/api/*'] };

export const middleware: EdgeMiddlewareHandler = async (context) => {
  return new Response('next', { headers: { 'x-middleware-next': '1' } });
};
```

### Types only

```ts
import type { AgentContext, CloudFunctionContext, EdgeFunctionContext } from '@edgeone/types';
```

## Config types / 配置类型（`@edgeone/types/config` subpath）

Type-safe `edgeone.config.ts` with autocompletion:

```ts
import { defineConfig } from '@edgeone/types/config';

export default defineConfig({
  outputDirectory: 'dist',
  buildCommand: 'npm run build',
  installCommand: 'npm install',
  nodeVersion: '20',
  schedules: [{ name: 'tick', cron: '*/5 * * * *', path: '/api/cron/tick' }],
});
```

- `defineConfig(config)` — typed identity helper for `edgeone.config.ts` (IDE type checking/autocompletion)
- `validateConfig(input)` — strict validation (`tefConfigSchema.safeParse`); fails on invalid input
- `edgeone.schema.json` — JSON Schema generated from the zod schema. CLI-generated configs
  auto-inject the hosted `$schema` URL; offline use `edgeone schema` to write a local copy
  and register the VS Code association.

## Versioned subpaths / 版本化子路径

- `@edgeone/types` — current function types / 函数类型
- `@edgeone/types/config` — config types + schema / 配置类型 + schema
- `@edgeone/types/v1` — versioned entry for function types / 函数类型版本化入口
- `@edgeone/types/v1/types` — types only / 仅类型
