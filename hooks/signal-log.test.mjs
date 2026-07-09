import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { writeSignalLog } from './signal-log.mjs';

test('plugin-skill-injection-optimization.SIGNAL_LOGGING.1 appends signal entries to JSONL', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'makers-signal-log-'));
  const logPath = join(tmp, '.edgeone', 'signal-log.jsonl');

  try {
    writeSignalLog(
      {
        hook: 'PreToolUse',
        trigger: 'pathPatterns',
        matchedSkill: 'makers-edge-functions',
        reason: 'functions/index.ts matched functions/**',
        platform: 'claude-code',
        toolName: 'Read',
      },
      { logPath, now: new Date('2026-06-24T00:00:00.000Z') },
    );

    const [line] = (await readFile(logPath, 'utf8')).trim().split('\n');

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

test('plugin-skill-injection-optimization.SIGNAL_LOGGING.2 requires the core signal fields', () => {
  assert.throws(
    () =>
      writeSignalLog({
        hook: 'PreToolUse',
        trigger: 'pathPatterns',
        matchedSkill: 'makers-edge-functions',
      }),
    /Missing signal log field: reason/,
  );
});
