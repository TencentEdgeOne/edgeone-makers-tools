import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildHookOutput,
  detectPlatform,
  renderSkillInstruction,
  selectSkillForPrompt,
} from './userprompt-skill-inject.mjs';

test('plugin-skill-injection-optimization.INSTRUCTION_INJECTION.2 selects makers-agents for agent prompts', () => {
  assert.equal(
    selectSkillForPrompt('Create a LangGraph agent with context.store support')?.skill,
    'makers-agents',
  );
});

test('plugin-skill-injection-optimization.INSTRUCTION_INJECTION.2 selects makers-deploy for deploy prompts', () => {
  assert.equal(
    selectSkillForPrompt('Deploy this project with edgeone pages deploy')?.skill,
    'makers-deploy',
  );
});

test('plugin-skill-injection-optimization.INSTRUCTION_INJECTION.2 selects makers-edge-functions for edge function prompts', () => {
  assert.equal(
    selectSkillForPrompt('Write an Edge Function under functions/index.ts')?.skill,
    'makers-edge-functions',
  );
});

test('plugin-skill-injection-optimization.INSTRUCTION_INJECTION.3 renders Claude Code Skill tool instruction', () => {
  assert.equal(
    renderSkillInstruction('makers-edge-functions', 'claude-code'),
    'You must run the Skill(makers-edge-functions) tool.',
  );
});

test('plugin-skill-injection-optimization.INSTRUCTION_INJECTION.4 renders Cursor slash skill instruction', () => {
  assert.equal(
    renderSkillInstruction('makers-edge-functions', 'cursor'),
    'Load the /makers-edge-functions skill.',
  );
});

test('plugin-skill-injection-optimization.INSTRUCTION_INJECTION.6 outputs only the loading instruction', () => {
  assert.deepEqual(
    buildHookOutput('Deploy to EdgeOne', 'claude-code'),
    {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'You must run the Skill(makers-deploy) tool.',
      },
    },
  );
});

test('plugin-skill-injection-optimization.INSTRUCTION_INJECTION.6 returns null when no skill matches', () => {
  assert.equal(buildHookOutput('Explain how git bisect works', 'claude-code'), null);
});

test('detectPlatform prefers explicit platform override', () => {
  assert.equal(
    detectPlatform({ EDGEONE_MAKERS_PLATFORM: 'cursor', CLAUDE_PLUGIN_ROOT: '/tmp/plugin' }),
    'cursor',
  );
});

test('plugin-skill-injection-optimization.SIGNAL_LOGGING.4 logs prompt score matches', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'makers-userprompt-log-'));
  const signalLogPath = join(tmp, '.edgeone', 'signal-log.jsonl');

  try {
    const output = buildHookOutput('Deploy this project with edgeone pages deploy', 'claude-code', {
      signalLogPath,
      now: new Date('2026-06-24T00:00:00.000Z'),
    });

    assert.equal(
      output.hookSpecificOutput.additionalContext,
      'You must run the Skill(makers-deploy) tool.',
    );

    const [line] = (await readFile(signalLogPath, 'utf8')).trim().split('\n');
    assert.deepEqual(JSON.parse(line), {
      timestamp: '2026-06-24T00:00:00.000Z',
      hook: 'UserPromptSubmit',
      trigger: 'promptScore',
      matchedSkill: 'makers-deploy',
      reason: 'prompt score 13 selected makers-deploy',
      platform: 'claude-code',
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

