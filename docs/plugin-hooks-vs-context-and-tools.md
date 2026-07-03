# Plugin Hooks vs Context-and-Tools 对比分析

> 日期：2026-06-30
> 对比项目：edgeone-makers-tools (当前) vs context-and-tools (Netlify 参考实现)

---

## 一、两个项目的架构概览

### Netlify context-and-tools

- **定位**：多平台 AI 技能分发系统（Claude Code / Cursor / Codex / Grok / Gemini）
- **核心理念**：纯静态内容 + AI 自主路由，零运行时代码
- **Plugin manifest**：声明式 `plugin.json`，无 hooks 字段
- **技能触发**：依赖 CLAUDE.md 路由表 → AI 自主选择加载哪个 SKILL.md
- **运行时代码**：无（只有构建脚本生成各平台格式）

```
skills/CLAUDE.md (路由表) → AI 阅读后自主选择 → 读取对应 SKILL.md
```

**关键文件：**
```
.claude-plugin/
├── plugin.json          # 纯元信息：name, version, description, author, repository
└── marketplace.json     # 市场注册配置
skills/
├── CLAUDE.md            # 路由决策表（给 AI 读的）
└── netlify-*/SKILL.md   # 13 个技能（YAML frontmatter 只有 name + description）
```

### EdgeOne edgeone-makers-tools (当前)

- **定位**：类似定位，多平台技能分发
- **核心理念**：Hooks 主动注入 + AI 被动执行，运行时代码辅助路由
- **Plugin manifest**：`manifest.json` 中绑定 hooks
- **技能触发**：3 层 hooks 逐步注入（SessionStart → UserPromptSubmit → PreToolUse）
- **运行时代码**：~700 行 JS + 状态文件 + 信号日志

```
hooks(拦截事件) → 正则匹配 → 强制注入 "You must run Skill(xxx)" → AI 被动执行
```

**关键文件：**
```
.claude-plugin/
└── manifest.json        # 含 "hooks": "../hooks/hooks.json"
hooks/
├── hooks.json                        # 3 个事件 hook 定义
├── sessionstart-minimal-context.mjs  # SessionStart: 注入启动提示
├── userprompt-skill-inject.mjs       # UserPromptSubmit: 对 prompt 评分选 skill
├── pretooluse-skill-inject.mjs       # PreToolUse: 路径/命令匹配 + validate + chainTo
└── signal-log.mjs                    # 诊断日志
skills/
├── makers-*/SKILL.md    # 8 个技能（frontmatter 含 pathPatterns/bashPatterns/validate/chainTo）
```

---

## 二、核心差异对比表

| 维度 | context-and-tools (Netlify) | edgeone-makers-tools (当前) |
|------|------|------|
| Plugin manifest | 纯声明式，无 hooks 字段 | manifest 绑定 hooks.json |
| 技能触发方式 | AI 读 CLAUDE.md 自主选择 | Hooks 代码强制注入指令 |
| 运行时代码 | 0 行 | ~700 行 JS |
| 路由决策者 | AI 自身 | Hooks 代码 |
| 状态管理 | 无 | .edgeone/pretooluse-injected-skills.json |
| 验证/链式触发 | 无 | frontmatter validate/chainTo 字段 |
| SKILL.md frontmatter | 仅 name + description | name + description + pathPatterns + bashPatterns + validate + chainTo + metadata |
| 多平台分发 | 纯构建脚本 | 构建脚本 + 运行时 hooks |
| 维护成本 | 极低 | 较高（hooks 逻辑 + 测试 + 状态文件） |

---

## 三、PreToolUse 阶段详细拆解

`pretooluse-skill-inject.mjs` 在 AI 每次调用 Read/Edit/Write/Bash 工具之前被触发，执行 4 段逻辑：

### 逻辑 1：Skill 匹配（路由注入）

**流程：**
```
AI 要 Read("functions/api/hello.ts")
→ hooks 解析路径，匹配 pathPatterns: ["functions/**"]
→ 去重检查（是否已注入过）
→ 输出: "You must run the Skill(makers-edge-functions) tool."
```

**实现要素：**
- `matchPathRule()` — 路径 glob 匹配
- `matchBashRule()` — 命令正则匹配
- `pickMostSpecificMatch()` — 多匹配时选最长 pattern（最具体）
- 工具类型分发：Bash 类工具走 bash 匹配，Read/Edit/Write 走路径匹配

**价值判断：低 / 可删除**
- CLAUDE.md 路由表已经让 AI 有能力自主选择
- AI 在写 `functions/` 下的代码时大概率已经加载过对应 skill
- Netlify 没有这层逻辑，完全靠 AI 自觉，验证了此路径可行

---

### 逻辑 2：去重状态管理

**流程：**
```
已注入 Set(["makers-edge-functions"])
→ 第二次触发同 skill 时跳过注入
→ 持久化到 .edgeone/pretooluse-injected-skills.json
```

**实现要素：**
- `readInjectedSkills()` / `writeInjectedSkills()` — 文件 I/O
- `persistInjectedSkills()` — 仅在集合变化时写盘
- JSON 格式：`{ "injectedSkills": ["makers-agents", "makers-edge-functions"] }`

**价值判断：纯辅助逻辑**
- 如果去掉逻辑 1 的强制注入，去重也没有存在意义

---

### 逻辑 3：Validate（代码写入验证）⭐

**流程：**
```
AI 要 Edit("functions/api/hello.ts", new_string: "process.env.API_KEY")
→ hooks 提取写入内容（new_string / content / text 等字段）
→ 对内容运行 validate 规则的正则匹配
→ 输出追加: "Validation reminder:\n- Use context.env in EdgeOne Makers runtime code."
```

**当前定义的全部 validate 规则（仅 makers-edge-functions 有）：**

| Pattern | 提醒内容 | 场景 |
|---------|---------|------|
| `process\.env` | "Use context.env in EdgeOne Makers runtime code." | Edge Function 不能用 Node.js 环境变量 |
| `new\s+Headers\s*\(` | "Use plain object headers for this runtime surface." | Edge Function 的 Headers 构造方式不同 |
| `fs\.writeFile` | "Edge Functions do not support filesystem writes." | Edge Function 无文件系统写入能力 |

**实现要素：**
- `getToolWriteContent()` — 从 payload 提取写入内容（兼容多种工具字段名）
- `selectValidationMatches()` — 对写入内容逐条运行 validate 正则
- `renderValidationReminder()` — 格式化为 "Validation reminder:\n- ..." 输出

**价值判断：这是唯一有独特价值的逻辑**
- SKILL.md 里虽然写了 "不要用 process.env"，但 AI 不一定每次都记得
- 这是**写入时**的最后一道防线 — 静态文档是事前引导，这是事中拦截
- 类似于 IDE 实时 lint 红线提醒
- 触发时机精确：只在 Edit/Write 工具调用时触发，只检查写入内容

---

### 逻辑 4：ChainTo（跨 skill 关联触发）

**流程：**
```
AI 要 Edit("functions/api/store.ts", new_string: "context.store.get(...)")
→ hooks 检测写入内容匹配 chainTo pattern: "\\bKV\\b|context\\.store"
→ 如果 makers-storage 尚未注入：
→ 输出追加: "You must run the Skill(makers-storage) tool."
```

**当前定义的全部 chainTo 规则：**

| 所属 Skill | 触发条件 | 链向 | 理由 |
|-----------|---------|------|------|
| makers-edge-functions | `\bKV\b\|context\.store` | makers-storage | Code references KV or store APIs. |
| makers-agents | `\bKV\b\|context\.store` | makers-storage | Code references KV or store APIs. |

**价值判断：中等 / 可用静态方式替代**
- 在 SKILL.md 正文中写 "If using `context.store`, also read `makers-storage/SKILL.md`" 即可
- AI 能理解交叉引用文本

---

## 四、"独立 lint hook" 的含义

当前 PreToolUse 是一个大杂烩 — 同一个 457 行的 JS 文件混合了：
- skill 路由注入（可删）
- 去重管理（可删）
- validate 验证（有价值）
- chainTo 关联（可用文档替代）

"独立 lint hook" = **只保留 validate 逻辑，剥离成一个纯粹的代码质量检查 hook**，与 skill 注入完全解耦。

### 方案 A：极简 PreToolUse hook（推荐）

保留一个 hook，但只做 validate：

```json
// hooks/hooks.json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|replace_in_file|write_to_file",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/validate-write.mjs\"",
        "timeout": 3
      }]
    }]
  }
}
```

`validate-write.mjs` 约 50 行，只做：
1. 从 stdin 读取 payload
2. 根据文件路径确定所属 skill
3. 对写入内容运行该 skill 的 validate 正则
4. 如果匹配，输出 "Validation reminder: ..."
5. 无状态文件、无 skill 注入、无去重逻辑

**优势：**
- 保留事中拦截的独特价值
- 代码量 457 行 → ~50 行
- 无状态文件（`.edgeone/` 目录可完全删除）
- 只在写入工具触发，不拦截 Read / Bash

### 方案 B：完全去掉 hooks，约束写入 SKILL.md 正文

在 `makers-edge-functions/SKILL.md` 正文中强调：

```markdown
## Critical Constraints (NEVER violate)

- `process.env` → use `context.env` instead
- `new Headers()` → use plain object `{ "Content-Type": "..." }`
- `fs.writeFile` or any filesystem write → Edge Functions have no writable FS
```

**优势：** 零运行时代码，完全对齐 Netlify 方案
**风险：** AI 可能在长对话中遗忘约束，写出违规代码时没有拦截

---

## 五、迁移建议总结

| 当前逻辑 | 处理方式 | 理由 |
|---------|---------|------|
| SessionStart hook | 删除 | CLAUDE.md 已作为项目指令自动加载 |
| UserPromptSubmit hook | 删除 | AI 读 CLAUDE.md 路由表后能自主判断 |
| PreToolUse: skill 路由注入 | 删除 | CLAUDE.md 路由表已够用 |
| PreToolUse: 去重状态管理 | 删除 | 路由注入删了就没必要了 |
| **PreToolUse: validate** | **保留（精简为独立 hook）** | 事中拦截有独特价值 |
| PreToolUse: chainTo | 删除，移到 SKILL.md 正文 | 文本交叉引用足够 |
| signal-log.mjs | 可选保留 | validate hook 中可保留诊断日志 |

**目标架构：**
```
CLAUDE.md (路由表) → AI 主动选择 skill → [可选] validate hook 做写入检查
```

**预期收益：**
- 运行时代码：~700 行 → ~50 行
- 状态文件：删除 `.edgeone/` 目录
- hooks 事件：3 个 → 1 个（仅 PreToolUse on write tools）
- SKILL.md frontmatter：可移除 pathPatterns / bashPatterns / chainTo（仅保留 name + description + validate）
- 与 Netlify 最佳实践对齐，降低维护成本

---

## 六、Netlify 关键实现参考

### plugin.json（无 hooks）
```json
{
  "name": "netlify-skills",
  "version": "1.1.0",
  "description": "Netlify platform skills for Claude Code",
  "author": { "name": "Netlify" },
  "repository": "https://github.com/netlify/context-and-tools"
}
```

### SKILL.md frontmatter（仅 name + description）
```yaml
---
name: netlify-functions
description: Guide for writing Netlify serverless functions. Use when creating API endpoints...
---
```

### 路由方式（CLAUDE.md 纯文本引导）
```markdown
**Building API endpoints or server-side logic?**
Read `netlify-functions/SKILL.md` for modern function syntax...

**Need low-latency middleware?**
Read `netlify-edge-functions/SKILL.md` for edge compute patterns.
```

无代码、无 hooks、无状态 — 完全信赖 AI 的理解和判断能力。
