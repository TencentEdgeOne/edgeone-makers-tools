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

export function loadSkillValidateRules(skillsDir = DEFAULT_SKILLS_DIR) {
  if (skillsDir === DEFAULT_SKILLS_DIR && cachedRules) return cachedRules;
  const rules = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name, 'SKILL.md'))
    .map((skillPath) => parseSkillValidateRule(skillPath))
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

function findSkillForPath(filePath, rules) {
  if (!filePath) return null;
  for (const rule of rules) {
    if (rule.pathPatterns.some((pattern) => globToRegExp(pattern).test(filePath))) return rule;
  }
  return null;
}

function selectValidationMatches(content, rule) {
  const seen = new Set();
  const matches = [];
  for (const item of rule.validate) {
    if (new RegExp(item.pattern).test(content) && !seen.has(item.message)) {
      seen.add(item.message);
      matches.push(item);
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

  const rule = findSkillForPath(
    getToolPath(getToolInput(payload)),
    options.rules || loadSkillValidateRules(),
  );
  if (!rule) return null;

  const matches = selectValidationMatches(content, rule);
  if (matches.length === 0) return null;

  if (shouldWriteSignalLog(options)) {
    for (const match of matches) {
      writeSignalLog(
        {
          hook: 'PreToolUse',
          trigger: 'validate',
          matchedSkill: rule.skill,
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

export async function main() {
  const rawInput = await readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const output = buildValidateWriteOutput(payload, { enableSignalLog: true });
  if (!output) return;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
