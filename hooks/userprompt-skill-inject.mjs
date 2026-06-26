#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { shouldWriteSignalLog, writeSignalLog } from './signal-log.mjs';

const SKILL_RULES = [
  {
    skill: 'makers-deploy',
    patterns: [
      [/\bedgeone\s+pages\s+deploy\b/i, 8],
      [/\bdeploy(?:ment)?\b/i, 5],
      [/\bpublish\b|\brelease\b/i, 4],
      [/上线|发布|部署/i, 5],
    ],
  },
  {
    skill: 'makers-edge-functions',
    patterns: [
      [/\bedge\s+functions?\b/i, 8],
      [/\bfunctions\/[\w./-]*/i, 6],
      [/\bV8\b/i, 3],
      [/\bonRequest\b/i, 2],
    ],
  },
  {
    skill: 'makers-cloud-functions',
    patterns: [
      [/\bcloud[-\s]?functions?\b/i, 8],
      [/\bcloud-functions\/[\w./-]*/i, 6],
      [/\bexpress\b|\bkoa\b|\bgin\b/i, 4],
      [/\bnode\.?js\b|\bgo\b|\bpython\b/i, 2],
    ],
  },
  {
    skill: 'makers-agents',
    patterns: [
      [/\bagents?\b/i, 5],
      [/\bdeepagents?\b|\blanggraph\b|\bcrewai\b/i, 7],
      [/\bopenai[-\s]?agents?\b|\bclaude[-\s]?sdk\b/i, 7],
      [/\bcontext\.(store|tools|sandbox)\b/i, 5],
      [/\bconversation[_-]?id\b|\bsse\b/i, 3],
      [/智能体|代理开发/i, 5],
    ],
  },
  {
    skill: 'makers-storage',
    patterns: [
      [/\bkv\b|\bblob\b/i, 6],
      [/\bstorage\b/i, 4],
      [/\bcontext\.store\b/i, 4],
      [/存储/i, 5],
    ],
  },
  {
    skill: 'makers-middleware',
    patterns: [
      [/\bmiddleware\b/i, 7],
      [/\brewrite\b|\bredirect\b/i, 4],
      [/\bauth\b.*\b(route|path|middleware)\b/i, 4],
      [/中间件|重写|重定向/i, 5],
    ],
  },
  {
    skill: 'makers-cli',
    patterns: [
      [/\bedgeone\s+/i, 3],
      [/\bcli\b|\bcommand\b/i, 3],
      [/\bPAGES_SOURCE\b/i, 5],
    ],
  },
  {
    skill: 'makers-recipes',
    patterns: [
      [/\btemplate\b|\bscaffold\b|\brecipe\b/i, 5],
      [/\bproject\s+structure\b/i, 4],
      [/模板|脚手架|项目结构/i, 5],
    ],
  },
];

function scorePrompt(prompt, rule) {
  return rule.patterns.reduce((score, [pattern, weight]) => {
    return pattern.test(prompt) ? score + weight : score;
  }, 0);
}

export function selectSkillForPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return null;

  let best = null;
  for (const rule of SKILL_RULES) {
    const score = scorePrompt(text, rule);
    if (score > 0 && (!best || score > best.score)) {
      best = { skill: rule.skill, score };
    }
  }
  return best;
}

export function detectPlatform(env = process.env) {
  const explicit = String(env.EDGEONE_MAKERS_PLATFORM || '').toLowerCase();
  if (explicit === 'claude' || explicit === 'claude-code') return 'claude-code';
  if (explicit === 'cursor') return 'cursor';
  if (explicit === 'codebuddy') return 'codebuddy';

  if (env.CURSOR_PLUGIN_ROOT) return 'cursor';
  if (env.CODEBUDDY_PLUGIN_ROOT) return 'codebuddy';
  if (env.CLAUDE_PLUGIN_ROOT) return 'claude-code';
  return 'claude-code';
}

export function renderSkillInstruction(skill, platform = 'claude-code') {
  if (platform === 'claude-code') {
    return `You must run the Skill(${skill}) tool.`;
  }
  return `Load the /${skill} skill.`;
}

function maybeWritePromptSignal(match, platform, options) {
  if (!shouldWriteSignalLog(options)) return;

  writeSignalLog(
    {
      hook: 'UserPromptSubmit',
      trigger: 'promptScore',
      matchedSkill: match.skill,
      reason: `prompt score ${match.score} selected ${match.skill}`,
      platform,
    },
    options,
  );
}

export function buildHookOutput(prompt, platform = 'claude-code', options = {}) {
  const match = selectSkillForPrompt(prompt);
  if (!match) return null;

  maybeWritePromptSignal(match, platform, options);

  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: renderSkillInstruction(match.skill, platform),
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
  const output = buildHookOutput(payload.prompt, detectPlatform(), { enableSignalLog: true });

  if (!output) return;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

