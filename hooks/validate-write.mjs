#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { shouldWriteSignalLog, writeSignalLog } from './signal-log.mjs';

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILLS_DIR = join(HOOKS_DIR, '..', 'skills');
const WRITE_TOOL_NAMES = new Set(['Edit', 'Write', 'replace_in_file', 'write_to_file']);
const WRITE_CONTENT_KEYS = ['content', 'new_string', 'new_str', 'newString', 'text'];
const PATH_KEYS = ['file_path', 'filePath', 'path', 'target_file'];

let cachedRules = null;

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}

function globToRegExp(pattern) {
  const source = String(pattern)
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => (segment === '**' ? '.*' : escapeRegExp(segment).replace(/\\\*/g, '[^/]*')))
    .join('/');
  return new RegExp(`(^|/)${source}$`);
}

function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? match[1] : '';
}

function parseYamlScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseFrontmatterString(frontmatter, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(frontmatter);
  return match ? parseYamlScalar(match[1]) : '';
}

function parseFrontmatterList(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const values = [];
  let inList = false;
  for (const line of lines) {
    if (!inList) {
      inList = new RegExp(`^${key}:\\s*$`).test(line);
      continue;
    }
    if (!line.trim()) continue;
    if (/^\S/.test(line)) break;
    const item = /^\s+-\s*(.+?)\s*$/.exec(line);
    if (item) values.push(parseYamlScalar(item[1]));
  }
  return values;
}

function assignObjectField(object, text) {
  const field = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(text);
  if (!field) return;
  object[field[1]] = parseYamlScalar(field[2]);
}

function parseFrontmatterObjectList(frontmatter, key, requiredFields = ['pattern', 'message']) {
  const lines = frontmatter.split(/\r?\n/);
  const values = [];
  let current = null;
  let inList = false;
  for (const line of lines) {
    if (!inList) {
      inList = new RegExp(`^${key}:\\s*$`).test(line);
      continue;
    }
    if (!line.trim()) continue;
    if (/^\S/.test(line)) break;
    const item = /^\s+-\s*(.*?)\s*$/.exec(line);
    if (item) {
      current = {};
      values.push(current);
      if (item[1]) assignObjectField(current, item[1]);
      continue;
    }
    if (current) assignObjectField(current, line.trim());
  }
  return values.filter((value) => requiredFields.every((field) => value[field]));
}

function parseSkillValidateRule(skillPath) {
  const frontmatter = parseFrontmatter(readFileSync(skillPath, 'utf8'));
  const skill = parseFrontmatterString(frontmatter, 'name');
  if (!skill) return null;
  const validate = parseFrontmatterObjectList(frontmatter, 'validate');
  if (validate.length === 0) return null;
  return {
    skill,
    pathPatterns: parseFrontmatterList(frontmatter, 'pathPatterns'),
    validate,
  };
}

/**
 * 读取各 skill 声明的 validate 规则。
 *
 * 读不到就返回空数组，绝不抛错：本函数跑在 PreToolUse 钩子里，
 * 模型每写一个文件都会经过它。skills/ 不存在（部分安装、CLAUDE_PLUGIN_ROOT
 * 解析错位）时若抛 ENOENT，用户每次写文件都会看到一次报错。
 * 校验器失效的正确表现是「不提醒」，而不是「报错」。
 */
export function loadSkillValidateRules(skillsDir = DEFAULT_SKILLS_DIR) {
  if (skillsDir === DEFAULT_SKILLS_DIR && cachedRules) return cachedRules;
  let entries;
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const rules = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name, 'SKILL.md'))
    .map((skillPath) => {
      try {
        return parseSkillValidateRule(skillPath);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (skillsDir === DEFAULT_SKILLS_DIR) cachedRules = rules;
  return rules;
}

function getToolName(payload) {
  return String(payload?.tool_name || payload?.toolName || '').trim();
}

function getToolInput(payload) {
  return payload?.tool_input || payload?.toolInput || {};
}

function getToolPath(toolInput) {
  const raw = PATH_KEYS.map((key) => toolInput[key]).find((value) => typeof value === 'string');
  return String(raw || '').replace(/\\/g, '/');
}

function getToolWriteContent(payload) {
  if (!WRITE_TOOL_NAMES.has(getToolName(payload))) return '';
  const toolInput = getToolInput(payload);
  for (const key of WRITE_CONTENT_KEYS) {
    if (typeof toolInput[key] === 'string') return toolInput[key];
  }
  return '';
}

/**
 * 返回所有 pathPatterns 命中该路径的规则。
 *
 * 不能只取第一条：规则按 skills/ 的字母序加载，而 `agents/**` 与
 * `cloud-functions/**` 这类前缀天然会重叠。只取首条等于让「哪条铁律生效」
 * 由目录名的字母序偶然决定，多个 skill 共管同一路径时会静默丢提醒。
 */
function findSkillsForPath(filePath, rules) {
  if (!filePath) return [];
  return rules.filter((rule) =>
    rule.pathPatterns.some((pattern) => globToRegExp(pattern).test(filePath)),
  );
}

/**
 * 收集全部命中的校验项，message 去重并保留首次出现顺序。
 * 每项带上来源 skill，供 signal log 归因。
 */
function selectValidationMatches(content, matchedRules) {
  const seen = new Set();
  const matches = [];
  for (const rule of matchedRules) {
    for (const item of rule.validate) {
      if (!new RegExp(item.pattern).test(content)) continue;
      if (seen.has(item.message)) continue;
      seen.add(item.message);
      matches.push({ ...item, skill: rule.skill });
    }
  }
  return matches;
}

function renderValidationReminder(messages) {
  return `Validation reminder:\n${messages.map((message) => `- ${message}`).join('\n')}`;
}

export function buildValidateWriteOutput(payload, options = {}) {
  if (!WRITE_TOOL_NAMES.has(getToolName(payload))) return null;
  const content = getToolWriteContent(payload);
  if (!content) return null;

  const matchedRules = findSkillsForPath(
    getToolPath(getToolInput(payload)),
    options.rules || loadSkillValidateRules(),
  );
  if (matchedRules.length === 0) return null;

  const matches = selectValidationMatches(content, matchedRules);
  if (matches.length === 0) return null;

  if (shouldWriteSignalLog(options)) {
    for (const match of matches) {
      writeSignalLog(
        {
          hook: 'PreToolUse',
          trigger: 'validate',
          matchedSkill: match.skill,
          reason: match.message,
          toolName: getToolName(payload),
        },
        options,
      );
    }
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: renderValidationReminder(matches.map((match) => match.message)),
    },
  };
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

/**
 * 钩子入口。任何异常都吞掉并静默返回：
 * 这段代码挡在模型每一次 Edit/Write 前面，宁可漏一次提醒，
 * 也不能因为自身出错（stdin 不是合法 JSON、规则读不到等）
 * 让用户每写一个文件都看到一次报错。
 */
export async function main() {
  let payload;
  try {
    const rawInput = await readStdin();
    payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  } catch {
    return;
  }

  let output;
  try {
    output = buildValidateWriteOutput(payload, { enableSignalLog: true });
  } catch {
    return;
  }

  if (!output) return;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // main() 内部已兜住所有异常；这里再兜一层，保证退出码始终是 0。
  main().catch(() => {});
}
