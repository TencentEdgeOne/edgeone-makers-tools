import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  buildPreToolUseOutput,
  loadSkillTriggerRules,
  selectSkillForToolUse,
} from './pretooluse-skill-inject.mjs';

test('plugin-skill-injection-optimization.PRETOOLUSE_HOOK.7 selects makers-edge-functions for Read functions/index.ts', () => {
  assert.equal(
    selectSkillForToolUse({
      tool_name: 'Read',
      tool_input: { file_path: 'functions/index.ts' },
    })?.skill,
    'makers-edge-functions',
  );
});

test('plugin-skill-injection-optimization.DOMESTIC_IDE_ADAPTATION.5 selects makers-edge-functions for CodeBuddy read_file filePath', () => {
  assert.equal(
    selectSkillForToolUse({
      tool_name: 'read_file',
      tool_input: { filePath: 'functions/index.ts' },
    })?.skill,
    'makers-edge-functions',
  );
});

test('plugin-skill-injection-optimization.PRETOOLUSE_HOOK.8 selects makers-deploy for edgeone pages deploy', () => {
  assert.equal(
    selectSkillForToolUse({
      tool_name: 'Bash',
      tool_input: { command: 'PAGES_SOURCE=skills edgeone pages deploy' },
    })?.skill,
    'makers-deploy',
  );
});

test('plugin-skill-injection-optimization.DOMESTIC_IDE_ADAPTATION.5 selects makers-deploy for CodeBuddy execute_command', () => {
  assert.equal(
    selectSkillForToolUse({
      tool_name: 'execute_command',
      tool_input: { command: 'PAGES_SOURCE=skills edgeone pages deploy' },
    })?.skill,
    'makers-deploy',
  );
});

test('plugin-skill-injection-optimization.PRETOOLUSE_HOOK.5 renders Cursor Skill loading instruction', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/agents/chat.ts' },
    },
    'cursor',
    { injectedSkills: new Set() },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Load the /makers-agents skill.',
    },
  });
});

test('plugin-skill-injection-optimization.PRETOOLUSE_HOOK.6 deduplicates injected Skills with state file', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'makers-pretooluse-'));
  const statePath = join(tmp, 'injected-skills.json');

  try {
    const payload = {
      tool_name: 'Read',
      tool_input: { file_path: '/project/functions/index.ts' },
    };

    assert.deepEqual(await buildPreToolUseOutput(payload, 'claude-code', { statePath }), {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: 'You must run the Skill(makers-edge-functions) tool.',
      },
    });
    assert.equal(await buildPreToolUseOutput(payload, 'claude-code', { statePath }), null);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('plugin-skill-injection-optimization.PRETOOLUSE_HOOK.3 returns null for unmatched tool use', async () => {
  assert.equal(
    await buildPreToolUseOutput(
      {
        tool_name: 'Read',
        tool_input: { file_path: 'src/components/Button.tsx' },
      },
      'claude-code',
      { injectedSkills: new Set() },
    ),
    null,
  );
});

test('plugin-skill-injection-optimization.MULTI_SIGNAL_MATCHING.1 loads pathPatterns from Skill frontmatter', async () => {
  const rules = await loadSkillTriggerRules();
  const edgeFunctions = rules.find((rule) => rule.skill === 'makers-edge-functions');

  assert.ok(edgeFunctions);
  assert.deepEqual(edgeFunctions.pathPatterns, ['functions/**']);
});

test('plugin-skill-injection-optimization.MULTI_SIGNAL_MATCHING.2 loads bashPatterns from Skill frontmatter', async () => {
  const rules = await loadSkillTriggerRules();
  const deploy = rules.find((rule) => rule.skill === 'makers-deploy');

  assert.ok(deploy);
  assert.ok(deploy.bashPatterns.includes('\\bedgeone\\s+pages\\s+deploy\\b'));
});

test('plugin-skill-injection-optimization.MULTI_SIGNAL_MATCHING.10 matches configured path patterns', () => {
  const cases = [
    ['edgeone.json', 'makers-deploy'],
    ['functions/index.ts', 'makers-edge-functions'],
    ['cloud-functions/api/index.ts', 'makers-cloud-functions'],
    ['agents/chat.ts', 'makers-agents'],
    ['middleware.ts', 'makers-middleware'],
  ];

  for (const [filePath, expectedSkill] of cases) {
    assert.equal(
      selectSkillForToolUse({
        tool_name: 'Read',
        tool_input: { file_path: filePath },
      })?.skill,
      expectedSkill,
    );
  }
});

test('plugin-skill-injection-optimization.MULTI_SIGNAL_MATCHING.10 matches configured bash patterns by specificity', () => {
  assert.equal(
    selectSkillForToolUse({
      tool_name: 'Bash',
      tool_input: { command: 'PAGES_SOURCE=skills edgeone pages deploy' },
    })?.skill,
    'makers-deploy',
  );

  assert.equal(
    selectSkillForToolUse({
      tool_name: 'Bash',
      tool_input: { command: 'edgeone makers env ls' },
    })?.skill,
    'makers-cli',
  );
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.1 loads validate rules from Skill frontmatter', async () => {
  const rules = await loadSkillTriggerRules();
  const edgeFunctions = rules.find((rule) => rule.skill === 'makers-edge-functions');

  assert.ok(edgeFunctions);
  assert.deepEqual(edgeFunctions.validate, [
    {
      pattern: 'process\\.env',
      message: 'Use context.env in EdgeOne Makers runtime code.',
    },
    {
      pattern: 'new\\s+Headers\\s*\\(',
      message: 'Use plain object headers for this runtime surface.',
    },
    {
      pattern: 'fs\\.writeFile',
      message: 'Edge Functions do not support filesystem writes.',
    },
  ]);
});

test('plugin-skill-injection-optimization.CHAIN_TO_LOADING.1 loads chainTo rules from Skill frontmatter', async () => {
  const rules = await loadSkillTriggerRules();
  const edgeFunctions = rules.find((rule) => rule.skill === 'makers-edge-functions');

  assert.ok(edgeFunctions);
  assert.deepEqual(edgeFunctions.chainTo, [
    {
      pattern: '\\bKV\\b|context\\.store',
      skill: 'makers-storage',
      reason: 'Code references KV or store APIs.',
    },
  ]);
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.2 warns on Edit content without blocking writes', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'Edit',
      tool_input: {
        file_path: 'functions/index.ts',
        new_string: 'export default () => process.env.API_KEY;',
      },
    },
    'claude-code',
    { injectedSkills: new Set() },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        'You must run the Skill(makers-edge-functions) tool.\n\nValidation reminder:\n- Use context.env in EdgeOne Makers runtime code.',
    },
  });
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.4 warns on Write content using new Headers', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'Write',
      tool_input: {
        file_path: 'functions/index.ts',
        content: 'return new Response(body, { headers: new Headers() });',
      },
    },
    'cursor',
    { injectedSkills: new Set(['makers-edge-functions']) },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Use plain object headers for this runtime surface.',
    },
  });
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.5 warns on Edge Function filesystem writes', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'Write',
      tool_input: {
        file_path: 'functions/index.ts',
        content: 'fs.writeFile("/tmp/out.txt", "data", () => {});',
      },
    },
    'claude-code',
    { injectedSkills: new Set(['makers-edge-functions']) },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Edge Functions do not support filesystem writes.',
    },
  });
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.6 does not warn for read-only tool use', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'Read',
      tool_input: {
        file_path: 'functions/index.ts',
        content: 'process.env.API_KEY',
      },
    },
    'claude-code',
    { injectedSkills: new Set(['makers-edge-functions']) },
  );

  assert.equal(output, null);
});

test('plugin-skill-injection-optimization.SIGNAL_LOGGING.3 logs PreToolUse path pattern matches', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'makers-pretooluse-log-'));
  const signalLogPath = join(tmp, '.edgeone', 'signal-log.jsonl');

  try {
    await buildPreToolUseOutput(
      {
        tool_name: 'Read',
        tool_input: { file_path: 'functions/index.ts' },
      },
      'claude-code',
      {
        injectedSkills: new Set(),
        signalLogPath,
        now: new Date('2026-06-24T00:00:00.000Z'),
      },
    );

    const [line] = (await readFile(signalLogPath, 'utf8')).trim().split('\n');
    assert.deepEqual(JSON.parse(line), {
      timestamp: '2026-06-24T00:00:00.000Z',
      hook: 'PreToolUse',
      trigger: 'pathPatterns',
      matchedSkill: 'makers-edge-functions',
      reason: 'functions/index.ts matched functions/**',
      platform: 'claude-code',
      toolName: 'Read',
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('plugin-skill-injection-optimization.SIGNAL_LOGGING.3 logs PreToolUse bash pattern matches', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'makers-pretooluse-log-'));
  const signalLogPath = join(tmp, '.edgeone', 'signal-log.jsonl');

  try {
    await buildPreToolUseOutput(
      {
        tool_name: 'Bash',
        tool_input: { command: 'PAGES_SOURCE=skills edgeone pages deploy' },
      },
      'cursor',
      {
        injectedSkills: new Set(),
        signalLogPath,
        now: new Date('2026-06-24T00:00:00.000Z'),
      },
    );

    const [line] = (await readFile(signalLogPath, 'utf8')).trim().split('\n');
    assert.deepEqual(JSON.parse(line), {
      timestamp: '2026-06-24T00:00:00.000Z',
      hook: 'PreToolUse',
      trigger: 'bashPatterns',
      matchedSkill: 'makers-deploy',
      reason: 'PAGES_SOURCE=skills edgeone pages deploy matched \\bedgeone\\s+pages\\s+deploy\\b',
      platform: 'cursor',
      toolName: 'Bash',
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('plugin-skill-injection-optimization.SIGNAL_LOGGING.3 logs validate matches with readable reasons', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'makers-pretooluse-log-'));
  const signalLogPath = join(tmp, '.edgeone', 'signal-log.jsonl');

  try {
    await buildPreToolUseOutput(
      {
        tool_name: 'Write',
        tool_input: {
          file_path: 'functions/index.ts',
          content: 'export default () => process.env.API_KEY;',
        },
      },
      'claude-code',
      {
        injectedSkills: new Set(['makers-edge-functions']),
        signalLogPath,
        now: new Date('2026-06-24T00:00:00.000Z'),
      },
    );

    const lines = (await readFile(signalLogPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    assert.deepEqual(
      lines.map((line) => line.trigger),
      ['pathPatterns', 'validate'],
    );
    assert.deepEqual(lines[1], {
      timestamp: '2026-06-24T00:00:00.000Z',
      hook: 'PreToolUse',
      trigger: 'validate',
      matchedSkill: 'makers-edge-functions',
      reason: 'Use context.env in EdgeOne Makers runtime code.',
      platform: 'claude-code',
      toolName: 'Write',
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('plugin-skill-injection-optimization.CHAIN_TO_LOADING.3 injects chained storage Skill for KV code', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'Write',
      tool_input: {
        file_path: 'functions/index.ts',
        content: 'const value = await KV.get("counter");',
      },
    },
    'claude-code',
    { injectedSkills: new Set() },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        'You must run the Skill(makers-edge-functions) tool.\n\nYou must run the Skill(makers-storage) tool.',
    },
  });
});

test('plugin-skill-injection-optimization.DOMESTIC_IDE_ADAPTATION.5 supports CodeBuddy write_to_file chainTo with filePath', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'write_to_file',
      tool_input: {
        filePath: 'functions/index.ts',
        content: 'const value = await KV.get("counter");',
      },
    },
    'codebuddy',
    { injectedSkills: new Set() },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        'Load the /makers-edge-functions skill.\n\nLoad the /makers-storage skill.',
    },
  });
});

test('plugin-skill-injection-optimization.DOMESTIC_IDE_ADAPTATION.5 supports CodeBuddy replace_in_file validate with filePath', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'replace_in_file',
      tool_input: {
        filePath: 'functions/index.ts',
        new_str: 'export default () => process.env.API_KEY;',
      },
    },
    'codebuddy',
    { injectedSkills: new Set(['makers-edge-functions']) },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Use context.env in EdgeOne Makers runtime code.',
    },
  });
});

test('plugin-skill-injection-optimization.CHAIN_TO_LOADING.4 does not repeat chained Skills already injected', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'Write',
      tool_input: {
        file_path: 'functions/index.ts',
        content: 'const value = await KV.get("counter");',
      },
    },
    'claude-code',
    { injectedSkills: new Set(['makers-storage']) },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'You must run the Skill(makers-edge-functions) tool.',
    },
  });
});

test('plugin-skill-injection-optimization.CHAIN_TO_LOADING.5 injects storage Skill for context.store code', async () => {
  const output = await buildPreToolUseOutput(
    {
      tool_name: 'Edit',
      tool_input: {
        file_path: 'agents/chat.ts',
        new_string: 'const session = context.store.openaiSession(context.conversation_id);',
      },
    },
    'cursor',
    { injectedSkills: new Set(['makers-agents']) },
  );

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Load the /makers-storage skill.',
    },
  });
});

test('plugin-skill-injection-optimization.SIGNAL_LOGGING.3 logs chainTo matches with readable reasons', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'makers-chain-log-'));
  const signalLogPath = join(tmp, '.edgeone', 'signal-log.jsonl');

  try {
    await buildPreToolUseOutput(
      {
        tool_name: 'Write',
        tool_input: {
          file_path: 'functions/index.ts',
          content: 'const value = await KV.get("counter");',
        },
      },
      'claude-code',
      {
        injectedSkills: new Set(['makers-edge-functions', 'makers-storage']),
        signalLogPath,
        now: new Date('2026-06-24T00:00:00.000Z'),
      },
    );

    const lines = (await readFile(signalLogPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    assert.deepEqual(
      lines.map((line) => line.trigger),
      ['pathPatterns', 'chainTo'],
    );
    assert.deepEqual(lines[1], {
      timestamp: '2026-06-24T00:00:00.000Z',
      hook: 'PreToolUse',
      trigger: 'chainTo',
      matchedSkill: 'makers-storage',
      reason: 'Code references KV or store APIs.',
      platform: 'claude-code',
      toolName: 'Write',
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

