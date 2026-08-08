import assert from 'node:assert/strict';
import test from 'node:test';

import { formatReport, summarize } from './doctor.mjs';

const EMPTY = {
  brokenLinks: [],
  danglingNames: [],
  deepLinks: [],
  missingTocs: [],
  oversized: [],
  manifest: { missing: [], extra: [] },
};

test('doctor.summarize reports ok when every check is empty', () => {
  const summary = summarize(EMPTY);
  assert.equal(summary.ok, true);
  assert.equal(summary.failures.length, 0);
});

test('doctor.summarize collects one failure per non-empty check', () => {
  const summary = summarize({
    ...EMPTY,
    brokenLinks: [{ file: 'a/SKILL.md', line: 1, target: 'x.md' }],
    missingTocs: [{ file: 'a/references/b.md', lines: 200 }],
  });
  assert.equal(summary.ok, false);
  assert.deepEqual(
    summary.failures.map((failure) => failure.check),
    ['broken-links', 'missing-toc'],
  );
  assert.equal(summary.failures[0].count, 1);
});

test('doctor.summarize treats a manifest gap as a single failure', () => {
  const summary = summarize({
    ...EMPTY,
    manifest: { missing: ['skills/makers-migration/SKILL.md'], extra: [] },
  });
  assert.equal(summary.ok, false);
  assert.deepEqual(summary.failures.map((f) => f.check), ['manifest-parity']);
  assert.equal(summary.failures[0].count, 1);
});

test('doctor.formatReport names each failing check and its locations', () => {
  const text = formatReport(
    summarize({ ...EMPTY, brokenLinks: [{ file: 'a/SKILL.md', line: 9, target: 'x.md' }] }),
  );
  assert.match(text, /broken-links/);
  assert.match(text, /a\/SKILL\.md:9/);
});

test('doctor.formatReport says everything passed when ok', () => {
  assert.match(formatReport(summarize(EMPTY)), /通过/);
});

test('doctor.formatReport renders an unreadable file as its own message, not raw JSON', () => {
  const text = formatReport(
    summarize({
      ...EMPTY,
      brokenLinks: [
        {
          file: 'a/references/locked.md',
          line: 0,
          target: null,
          error: "EACCES: permission denied, open 'a/references/locked.md'",
        },
      ],
    }),
  );
  assert.match(text, /无法读取/);
  assert.match(text, /a\/references\/locked\.md/);
  assert.match(text, /EACCES/);
  // line: 0 会让 `if (item.line)` 落空，退化成 JSON.stringify 的裸对象。
  assert.ok(!text.includes('{"'), `报告里出现了裸 JSON 片段:\n${text}`);
});
