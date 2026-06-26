import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MINIMAL_SESSION_START_CONTEXT,
  buildSessionStartOutput,
} from './sessionstart-minimal-context.mjs';

test('plugin-skill-injection-optimization.MINIMAL_SESSION_START.1 injects compact startup principles', () => {
  const lines = MINIMAL_SESSION_START_CONTEXT.trim().split('\n');

  assert.ok(lines.length <= 8);
  assert.match(MINIMAL_SESSION_START_CONTEXT, /CLAUDE\.md/);
  assert.match(MINIMAL_SESSION_START_CONTEXT, /AGENTS\.md/);
  assert.match(MINIMAL_SESSION_START_CONTEXT, /matching makers-\*/);
  assert.match(MINIMAL_SESSION_START_CONTEXT, /Do not load all Skills/);
});

test('plugin-skill-injection-optimization.MINIMAL_SESSION_START.1 omits knowledge graph content', () => {
  assert.doesNotMatch(MINIMAL_SESSION_START_CONTEXT, /DeepAgents/);
  assert.doesNotMatch(MINIMAL_SESSION_START_CONTEXT, /context\.store/);
  assert.doesNotMatch(MINIMAL_SESSION_START_CONTEXT, /PAGES_SOURCE/);
  assert.doesNotMatch(MINIMAL_SESSION_START_CONTEXT, /profiler/i);
});

test('plugin-skill-injection-optimization.MINIMAL_SESSION_START.2 outputs SessionStart additionalContext', () => {
  assert.deepEqual(buildSessionStartOutput(), {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: MINIMAL_SESSION_START_CONTEXT,
    },
  });
});

