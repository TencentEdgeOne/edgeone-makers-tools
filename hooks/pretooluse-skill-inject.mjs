#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { shouldWriteSignalLog, writeSignalLog } from './signal-log.mjs';
import { detectPlatform, renderSkillInstruction } from './userprompt-skill-inject.mjs';

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILLS_DIR = join(HOOKS_DIR, '..', 'skills');
const BASH_TOOL_NAMES = new Set(['Bash', 'execute_command']);
const PATH_TOOL_NAMES = new Set(['Read', 'Edit', 'Write', 'read_file', 'replace_in_file', 'write_to_file']);
const WRITE_TOOL_NAMES = new Set(['Edit', 'Write', 'replace_in_file', 'write_to_file']);

let cachedRules = null;

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}

function globToRegExp(pattern) {
  const source = String(pattern)
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => {
      if (segment === '**') return '.*';
      return escapeRegExp(segment).replace(/\\\*/g, '[^/]*');
    })
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
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const match = pattern.exec(frontmatter);
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

function parseSkillTriggerRule(skillPath) {
  const frontmatter = parseFrontmatter(readFileSync(skillPath, 'utf8'));
  const skill = parseFrontmatterString(frontmatter, 'name');
  if (!skill) return null;

  return {
    skill,
    pathPatterns: parseFrontmatterList(frontmatter, 'pathPatterns'),
    bashPatterns: parseFrontmatterList(frontmatter, 'bashPatterns'),
    validate: parseFrontmatterObjectList(frontmatter, 'validate'),
    chainTo: parseFrontmatterObjectList(frontmatter, 'chainTo', ['pattern', 'skill', 'reason']),
  };
}

export function loadSkillTriggerRules(skillsDir = DEFAULT_SKILLS_DIR) {
  if (skillsDir === DEFAULT_SKILLS_DIR && cachedRules) return cachedRules;

  const rules = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name, 'SKILL.md'))
    .map((skillPath) => parseSkillTriggerRule(skillPath))
    .filter(
      (rule) =>
        rule &&
        (rule.pathPatterns.length > 0 ||
          rule.bashPatterns.length > 0 ||
          rule.validate.length > 0 ||
          rule.chainTo.length > 0),
    );

  if (skillsDir === DEFAULT_SKILLS_DIR) cachedRules = rules;
  return rules;
}

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function getToolName(payload) {
  return String(payload?.tool_name || payload?.toolName || '').trim();
}

function getToolInput(payload) {
  return payload?.tool_input || payload?.toolInput || {};
}

function getToolPath(toolInput) {
  return normalizePath(
    toolInput.file_path || toolInput.filePath || toolInput.path || toolInput.target_file || '',
  );
}

function getToolCommand(toolInput) {
  return String(toolInput.command || '').trim();
}

function pickMostSpecificMatch(matches) {
  if (matches.length === 0) return null;
  return matches.sort((left, right) => right.specificity - left.specificity)[0];
}

function matchPathRule(filePath, rules) {
  if (!filePath) return null;

  const matches = [];
  for (const rule of rules) {
    for (const pattern of rule.pathPatterns || []) {
      if (globToRegExp(pattern).test(filePath)) {
        matches.push({
          skill: rule.skill,
          trigger: 'pathPatterns',
          reason: `${filePath} matched ${pattern}`,
          validate: rule.validate || [],
          chainTo: rule.chainTo || [],
          specificity: pattern.length,
        });
      }
    }
  }

  return pickMostSpecificMatch(matches);
}

function matchBashRule(command, rules) {
  if (!command) return null;

  const matches = [];
  for (const rule of rules) {
    for (const pattern of rule.bashPatterns || []) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(command)) {
        matches.push({
          skill: rule.skill,
          trigger: 'bashPatterns',
          reason: `${command} matched ${pattern}`,
          validate: [],
          chainTo: [],
          specificity: pattern.length,
        });
      }
    }
  }

  return pickMostSpecificMatch(matches);
}

export function selectSkillForToolUse(payload, rules = loadSkillTriggerRules()) {
  const toolName = getToolName(payload);
  const toolInput = getToolInput(payload);

  if (BASH_TOOL_NAMES.has(toolName)) {
    return matchBashRule(getToolCommand(toolInput), rules);
  }

  if (PATH_TOOL_NAMES.has(toolName)) {
    return matchPathRule(getToolPath(toolInput), rules);
  }

  return null;
}

function getToolWriteContent(payload) {
  const toolName = getToolName(payload);
  if (!WRITE_TOOL_NAMES.has(toolName)) return '';

  const toolInput = getToolInput(payload);
  const candidateKeys = ['content', 'new_string', 'new_str', 'newString', 'text'];
  for (const key of candidateKeys) {
    if (typeof toolInput[key] === 'string') return toolInput[key];
  }

  return '';
}

function selectValidationMatches(payload, match) {
  const content = getToolWriteContent(payload);
  if (!content) return [];

  const matches = [];
  for (const rule of match.validate || []) {
    const regex = new RegExp(rule.pattern);
    if (regex.test(content)) {
      matches.push({
        pattern: rule.pattern,
        message: rule.message,
      });
    }
  }

  return matches.filter(
    (matchItem, index, list) =>
      list.findIndex((candidate) => candidate.message === matchItem.message) === index,
  );
}

function selectChainToMatches(payload, match) {
  const content = getToolWriteContent(payload);
  if (!content) return [];

  const matches = [];
  for (const rule of match.chainTo || []) {
    const regex = new RegExp(rule.pattern);
    if (regex.test(content)) {
      matches.push({
        pattern: rule.pattern,
        skill: rule.skill,
        reason: rule.reason,
      });
    }
  }

  return matches.filter(
    (matchItem, index, list) =>
      list.findIndex(
        (candidate) => candidate.skill === matchItem.skill && candidate.reason === matchItem.reason,
      ) === index,
  );
}

function renderValidationReminder(messages) {
  return `Validation reminder:\n${messages.map((message) => `- ${message}`).join('\n')}`;
}

function maybeWritePreToolUseSignal(match, payload, platform, options) {
  if (!shouldWriteSignalLog(options)) return;

  writeSignalLog(
    {
      hook: 'PreToolUse',
      trigger: match.trigger,
      matchedSkill: match.skill,
      reason: match.reason,
      platform,
      toolName: getToolName(payload),
    },
    options,
  );
}

function maybeWriteValidationSignals(validationMatches, match, payload, platform, options) {
  if (!shouldWriteSignalLog(options)) return;

  for (const validationMatch of validationMatches) {
    writeSignalLog(
      {
        hook: 'PreToolUse',
        trigger: 'validate',
        matchedSkill: match.skill,
        reason: validationMatch.message,
        platform,
        toolName: getToolName(payload),
      },
      options,
    );
  }
}

function maybeWriteChainToSignals(chainToMatches, payload, platform, options) {
  if (!shouldWriteSignalLog(options)) return;

  for (const chainToMatch of chainToMatches) {
    writeSignalLog(
      {
        hook: 'PreToolUse',
        trigger: 'chainTo',
        matchedSkill: chainToMatch.skill,
        reason: chainToMatch.reason,
        platform,
        toolName: getToolName(payload),
      },
      options,
    );
  }
}

function defaultStatePath() {
  return process.env.EDGEONE_MAKERS_PRETOOLUSE_STATE || join(process.cwd(), '.edgeone', 'pretooluse-injected-skills.json');
}

async function readInjectedSkills(statePath) {
  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed.injectedSkills) ? parsed.injectedSkills : []);
  } catch {
    return new Set();
  }
}

async function writeInjectedSkills(statePath, injectedSkills) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(
    statePath,
    `${JSON.stringify({ injectedSkills: [...injectedSkills].sort() }, null, 2)}\n`,
  );
}

async function getInjectedSkills(options) {
  if (options.injectedSkills) return options.injectedSkills;
  return readInjectedSkills(options.statePath || defaultStatePath());
}

async function persistInjectedSkills(injectedSkills, options) {
  if (options.injectedSkills) return;
  await writeInjectedSkills(options.statePath || defaultStatePath(), injectedSkills);
}

export async function buildPreToolUseOutput(payload, platform = 'claude-code', options = {}) {
  const match = selectSkillForToolUse(payload);
  if (!match) return null;

  const additionalContext = [];
  const validationMatches = selectValidationMatches(payload, match);
  const chainToMatches = selectChainToMatches(payload, match);
  maybeWritePreToolUseSignal(match, payload, platform, options);
  maybeWriteValidationSignals(validationMatches, match, payload, platform, options);
  maybeWriteChainToSignals(chainToMatches, payload, platform, options);

  const injectedSkills = await getInjectedSkills(options);
  let injectedSkillsChanged = false;
  if (!injectedSkills.has(match.skill)) {
    injectedSkills.add(match.skill);
    injectedSkillsChanged = true;
    additionalContext.push(renderSkillInstruction(match.skill, platform));
  }

  for (const chainToMatch of chainToMatches) {
    if (injectedSkills.has(chainToMatch.skill)) continue;

    injectedSkills.add(chainToMatch.skill);
    injectedSkillsChanged = true;
    additionalContext.push(renderSkillInstruction(chainToMatch.skill, platform));
  }

  if (injectedSkillsChanged) {
    await persistInjectedSkills(injectedSkills, options);
  }

  const validationMessages = validationMatches.map((validationMatch) => validationMatch.message);
  if (validationMessages.length > 0) {
    additionalContext.push(renderValidationReminder(validationMessages));
  }

  if (additionalContext.length === 0) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: additionalContext.join('\n\n'),
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
  const output = await buildPreToolUseOutput(payload, detectPlatform(), { enableSignalLog: true });

  if (!output) return;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

