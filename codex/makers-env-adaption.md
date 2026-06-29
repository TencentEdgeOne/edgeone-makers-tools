---
name: edgeone-makers-env-adaption
description: >-
  Environment-specific adaptation rules for EdgeOne Makers Skills running in
  sandboxed or restricted AI coding environments (e.g. WorkBuddy).
  Trigger when: the user is working in WorkBuddy, a sandboxed IDE, or any
  non-interactive/CI environment where CLI commands may hang or network is isolated.
  Covers: non-interactive CLI flags, network isolation workarounds, login in sandbox,
  proxy bypass, file preview constraints (MUST use http:// via dev server, NEVER file://,
  NEVER python -m http.server / npx serve), dev server requirements.
metadata:
  author: edgeone
  version: "1.1.0"
---

# 运行环境适配指南

> 本文档说明 EdgeOne Makers Skills 在不同 AI 编码环境中的特殊约束和适配规则。
> 当前覆盖：**WorkBuddy**（腾讯沙箱 IDE）

---

## 🚦 Quick Reference：预览决策树

进入"展示 / 预览"环节时，**先看这里再决定怎么 `present_files`**：

```
            ┌─ 任务完成要交付？── 是 ──→ present_files(部署后的 EdgeOne URL) ✅
            │
进入预览 ───┤
            │                      ┌─ dev server 已起？─ 是 ──→ present_files(http://127.0.0.1:8088/) ✅
            └─ 还要继续改？ ──────┤
                                    └─ 否 ──→ 启 edgeone makers dev → present_files(...)
```

| 想做的事 | 正确做法 | 错误做法（会坏） |
|---|---|---|
| 预览本地 dev server | `present_files("http://127.0.0.1:8088/")` | ❌ 传 `/path/to/index.html`（IDE 内部以 file:// 打开） |
| 预览已部署项目 | `present_files(deploy_url)` 含 `?eo_token=...` | ❌ 传本地 `dist/index.html` 路径 |
| 启 dev server | `edgeone makers dev --name <p> --skip-env-sync` | ❌ `python -m http.server` / `npx serve` |
| 验证 dev server 起来了 | `present_files(http://...)` 或用户系统终端 | ❌ Bash `curl localhost`（沙箱网络隔离） |

**核心铁律**：在 Makers 项目里，**任何 HTML / URL 预览都必须经过 HTTP 协议**。`file://` 看似省事，但 fetch / SSE / Blob / KV 全部失效。

### 违规症状自查（看到立即回看上面）

- 浏览器 Console：`TypeError: Failed to fetch` / `CORS policy` 报错
- 页面 HTML 正常加载但 JS 请求全部 404
- SSE / EventSource 一连接就断开
- 本地能跑、部署到线上就坏（或反过来）

---

## WorkBuddy 沙箱环境

WorkBuddy 是一个沙箱化的远程 IDE 环境，执行 AI 编码任务时有以下与本地开发不同的约束。

---

### 1. 非交互模式（所有 CLI 命令必须避免交互提示）

WorkBuddy 沙箱内 CLI 交互提示会导致进程永久挂起。所有 `edgeone` CLI 命令必须携带非交互标志：

| 场景 | 必需标志 | 原因 |
|------|---------|------|
| 本地开发 | `--skip-env-sync` | 跳过"同步环境变量？"确认 |
| 关联项目 | `--name <project>` | 跳过交互式项目选择 |
| 未登录时认证 | `-t <token>` | 直接传 token，不弹登录 |
| 部署输出 | `--json` | 机器可读 JSON，避免 ANSI 解析 |

```bash
# 正确：本地开发
edgeone makers dev --name my-project --skip-env-sync

# 正确：部署
edgeone makers deploy -n my-project --json

# 错误：会挂起
edgeone makers dev
```

---

### 2. 登录认证

**Token 解析优先级**（CLI 自动按此顺序检查）：
1. `-t <token>` 命令行参数
2. `EDGEONE_PAGES_API_TOKEN` 环境变量
3. `<cwd>/.edgeone/auth.json`（`edgeone login --local` 写入）
4. `~/.edgeone/` 全局凭据

**推荐方式**：浏览器登录 + `--local` 标志：
```bash
edgeone login --site china --local
```
`--local` 将凭据写入项目目录 `<cwd>/.edgeone/auth.json`，绕过 home 目录写入限制。

**登录状态检测**：
```bash
edgeone whoami  # exit 0 = 已登录，exit 1 = 未登录（不会挂起）
```

**CLI 版本要求**：>= 1.6.7（低版本缺少非交互修复，whoami 会挂起）

---

### 3. 网络隔离

**Bash 工具网络与宿主机隔离**——在 WorkBuddy 的 Bash 中 `curl localhost:<port>` 无法访问宿主机的 dev server。

| 验证方式 | 可用性 | 说明 |
|---------|--------|------|
| 内置浏览器预览（`present_files`） | ✅ 可用 | 走宿主机网络，可靠 |
| 用户系统终端 | ✅ 可用 | `curl http://127.0.0.1:8088/` |
| Bash 工具 curl | ❌ 不可用 | 路由到沙箱内部，返回 404 |

**不要**用 Bash curl 判断 dev server 是否启动成功。用 `present_files` 或直接部署验证。

---

### 4. IPv4 强制（127.0.0.1，不用 localhost）

Dev server 监听 IPv6 双栈（`::`），但沙箱中 `localhost` 解析到 `::1`，导致假 404。

```bash
# 正确
curl http://127.0.0.1:8088/

# 错误（沙箱中会 404）
curl http://localhost:8088/
```

预览 URL 也必须用 `127.0.0.1`：
```
present_files: http://127.0.0.1:8088/
```

---

### 5. Proxy 劫持（curl 需 --noproxy）

沙箱注入 `http_proxy` 环境变量，curl 默认走代理，会吞掉 SSE 流式响应。

```bash
# 正确
curl --noproxy '*' http://127.0.0.1:8088/api/chat

# 错误（返回 "Empty reply" / status 000）
curl http://127.0.0.1:8088/api/chat
```

内置浏览器预览不受 proxy 影响。

---

### 6. Home 目录写入限制

沙箱阻止写入 `~/.edgeone/`，但允许写入项目目录。

| 路径 | 可写 | 说明 |
|------|------|------|
| `<cwd>/.edgeone/` | ✅ | `--local` 写入位置 |
| `~/.edgeone/` | ❌ | EPERM 错误 |

出现 `setLocalData EPERM` 不影响服务运行，仅影响 CLI 本地状态持久化。

---

### 7. 命令执行模式（同步 vs 异步）

| 命令 | 执行模式 | 原因 |
|------|---------|------|
| `npm install` | **前台同步** | 通常 10-30s，后台执行会导致后续命令缺依赖 |
| `edgeone makers dev` | **后台异步** (`run_in_background`) | 长驻进程，不阻塞对话 |
| `edgeone makers deploy` | **前台同步** | 1-3 分钟，结果是核心交付物，必须立即展示 |

### 7.1 预览 & Dev Server 全流程（必走 HTTP，禁止 file://）

开发完成后**直接启动 dev server 预览**，不要询问"是否要预览"。完整流程：

> ⚠️ **WorkBuddy 默认行为**：创建 HTML 文件时平台可能自动用 file:// 打开预览——**忽略它**，这不是有效预览。必须等 `edgeone makers dev` 启动后，通过 HTTP URL 重新打开覆盖。

1. 启动 `edgeone makers dev --name <project> --skip-env-sync`（**后台异步**，见 §7）
2. 等待 2-3 秒让 dev server 就绪
3. **`present_files` 传 `http://127.0.0.1:8088/`**（注意是 `127.0.0.1`，**不是** `localhost` —— 见 §4）
4. 告知用户："项目已启动本地预览，请查看效果。如果没有问题，我可以直接帮你部署到线上。"

用户确认后再执行 `edgeone makers deploy -n <project> --json`（**前台同步**，见 §7）。

#### ⛔ 严禁 file:// 预览

**严禁**把本地 HTML 路径传给 `present_files` —— IDE 内部会用 `file://` 协议打开，导致 fetch / SSE / Blob / KV 全部失败。**没有例外，没有"只是临时看看"的场景**。

```bash
# ✅ 正确
present_files("http://127.0.0.1:8088/")                                       # dev server
present_files("https://my-app-w9t0lxe8.edgeone.cool?eo_token=...")            # 部署后

# ❌ 错误（IDE 会以 file:// 协议打开，所有 API 失效）
present_files("/Users/foo/dist/index.html")
present_files("./dist/index.html")
present_files("file:///Users/foo/dist/index.html")
```

**违规症状**（一旦看到立即自查 § Quick Reference）：
- Console: `TypeError: Failed to fetch` / `Cross-Origin Request Blocked`
- 页面 DOM 正常但所有 `fetch` / `XMLHttpRequest` 返回失败
- SSE / EventSource 连接立即断开
- `@edgeone/pages-blob` 调用报 `Missing: deployCredential`（即使项目已 link，因为 file:// 下无 HTTP 上下文）

#### ⛔ 严禁自建 HTTP Server

`edgeone makers dev` **不可被**以下命令替代：
- `python -m http.server`
- `npx serve` / `npx http-server`
- Node.js `http.createServer` / `express` 起本地服务

**原因**：`edgeone makers dev` 注入 Blob 凭证、模拟 Cloud Functions 路由、处理 Edge Functions、中间件链。自建 server 只能托管静态文件，行为与生产不一致，会出现"本地能跑部署就坏"或反过来的玄学问题。

---

### 10. Next.js HMR 跨域配置

Next.js 15+ dev server 默认只信任 `localhost`，沙箱用 `127.0.0.1` 访问会被视为跨域，HMR WebSocket 被拦截导致页面交互无响应。

**必须在 `next.config.js` 中添加**：
```javascript
allowedDevOrigins: ["127.0.0.1"]
```

注意：值是**纯 host**，不带 `http://` 前缀，不指定端口。

---

### 11. 项目关联（Blob/KV 必需）

使用 Blob Storage 或 KV 的项目，启动 dev 之前必须确保项目已 link（存在 `.edgeone/project.json`）。未 link 时 Blob/KV 调用报 `Missing: deployCredential`。

**检测是否已 link**：
```bash
cat .edgeone/project.json 2>/dev/null && echo "LINKED" || echo "NOT LINKED"
```

**关联方式**：

```bash
# 显式 link（项目不存在时自动创建）
edgeone makers link --name <project-name> -t <token>

# 或通过 dev 命令隐式 link
edgeone makers dev --name <project-name> --skip-env-sync
```

`--name` 指定的项目如果远端不存在，`link` 命令会自动创建。

**注意**：即使是纯静态项目，只要代码中引入了 `@edgeone/pages-blob`，不 link 就一定报错。

---

### 12. 框架版本要求

| 框架/包 | 最低版本 | 原因 |
|---------|---------|------|
| EdgeOne CLI | >= 1.6.7 | 非交互修复、whoami fail-fast、--json 支持 |
| Next.js | 16.x | 框架适配器跟随新版本 |
| @edgeone/pages-blob | >= 0.1.3 | 低版本有已知 bug |

使用 `create-next-app@latest` 而非手动指定旧版本。
