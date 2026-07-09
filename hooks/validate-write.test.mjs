import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { buildValidateWriteOutput, loadSkillValidateRules } from './validate-write.mjs';

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.1 loads validate rules from Skill frontmatter', async () => {
  const rules = await loadSkillValidateRules();
  const edgeFunctions = rules.find((rule) => rule.skill === 'edgeone-makers-edge-functions');

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

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.2 warns on Edit content without blocking writes', () => {
  const output = buildValidateWriteOutput({
    tool_name: 'Edit',
    tool_input: {
      file_path: 'functions/index.ts',
      new_string: 'export default () => process.env.API_KEY;',
    },
  });

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Use context.env in EdgeOne Makers runtime code.',
    },
  });
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.4 warns on Write content using new Headers', () => {
  const output = buildValidateWriteOutput({
    tool_name: 'Write',
    tool_input: {
      file_path: 'functions/index.ts',
      content: 'return new Response(body, { headers: new Headers() });',
    },
  });

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Use plain object headers for this runtime surface.',
    },
  });
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.5 warns on Edge Function filesystem writes', () => {
  const output = buildValidateWriteOutput({
    tool_name: 'Write',
    tool_input: {
      file_path: 'functions/index.ts',
      content: 'fs.writeFile("/tmp/out.txt", "data", () => {});',
    },
  });

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Edge Functions do not support filesystem writes.',
    },
  });
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.6 does not warn for read-only tool use', () => {
  assert.equal(
    buildValidateWriteOutput({
      tool_name: 'Read',
      tool_input: {
        file_path: 'functions/index.ts',
        content: 'process.env.API_KEY',
      },
    }),
    null,
  );
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.6 does not warn for frontend paths outside validate scope', () => {
  assert.equal(
    buildValidateWriteOutput({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'src/components/Button.tsx',
        new_string: 'export default () => process.env.API_KEY;',
      },
    }),
    null,
  );
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.6 does not warn for skills without validate rules', () => {
  assert.equal(
    buildValidateWriteOutput({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'agents/chat.ts',
        new_string: 'const session = context.store.openaiSession(context.conversation_id);',
      },
    }),
    null,
  );
});

test('plugin-skill-injection-optimization.VALIDATE_RED_LINES.6 matches edge-functions path after pathPatterns fix', () => {
  const output = buildValidateWriteOutput({
    tool_name: 'Write',
    tool_input: {
      file_path: 'edge-functions/api/hello.js',
      content: 'export default () => process.env.API_KEY;',
    },
  });

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Use context.env in EdgeOne Makers runtime code.',
    },
  });
});

test('plugin-skill-injection-optimization.DOMESTIC_IDE_ADAPTATION.5 supports CodeBuddy replace_in_file validate with new_str', () => {
  const output = buildValidateWriteOutput({
    tool_name: 'replace_in_file',
    tool_input: {
      filePath: 'functions/index.ts',
      new_str: 'export default () => process.env.API_KEY;',
    },
  });

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Use context.env in EdgeOne Makers runtime code.',
    },
  });
});

test('plugin-skill-injection-optimization.DOMESTIC_IDE_ADAPTATION.5 supports CodeBuddy write_to_file validate with filePath', () => {
  const output = buildValidateWriteOutput({
    tool_name: 'write_to_file',
    tool_input: {
      filePath: 'functions/index.ts',
      content: 'return new Response(body, { headers: new Headers() });',
    },
  });

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'Validation reminder:\n- Use plain object headers for this runtime surface.',
    },
  });
});

test('plugin-skill-injection-optimization.SIGNAL_LOGGING.3 logs validate matches with readable reasons', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'makers-validate-log-'));
  const signalLogPath = join(tmp, '.edgeone', 'signal-log.jsonl');

  try {
    buildValidateWriteOutput(
      {
        tool_name: 'Write',
        tool_input: {
          file_path: 'functions/index.ts',
          content: 'export default () => process.env.API_KEY;',
        },
      },
      {
        signalLogPath,
        now: new Date('2026-07-03T00:00:00.000Z'),
      },
    );

    const [line] = (await readFile(signalLogPath, 'utf8')).trim().split('\n');
    assert.deepEqual(JSON.parse(line), {
      timestamp: '2026-07-03T00:00:00.000Z',
      hook: 'PreToolUse',
      trigger: 'validate',
      matchedSkill: 'edgeone-makers-edge-functions',
      reason: 'Use context.env in EdgeOne Makers runtime code.',
      toolName: 'Write',
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
