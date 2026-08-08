import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { findBrokenLinks } from './skill-graph.mjs';

/** 在临时目录里造一棵假的 skills 树，键是相对路径。 */
async function makeSkills(tree) {
  const root = await mkdtemp(join(tmpdir(), 'skill-graph-'));
  for (const [relativePath, content] of Object.entries(tree)) {
    const full = join(root, relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
}

test('skill-graph.findBrokenLinks reports a link whose target does not exist', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md': '---\nname: a\n---\n\nSee [kv](kv-storage.md) here.\n',
  });
  try {
    assert.deepEqual(findBrokenLinks(root), [
      { file: 'makers-a/SKILL.md', line: 5, target: 'kv-storage.md' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findBrokenLinks accepts a link that resolves relative to its own file', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md': '---\nname: a\n---\n\nSee [kv](references/kv.md).\n',
    'makers-a/references/kv.md': '# KV\n',
  });
  try {
    assert.deepEqual(findBrokenLinks(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findBrokenLinks resolves a one-level cross-skill link', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md': '---\nname: a\n---\n\n[x](../makers-b/references/x.md)\n',
    'makers-b/references/x.md': '# X\n',
  });
  try {
    assert.deepEqual(findBrokenLinks(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findBrokenLinks flags the extra skills/ level bug', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md': '---\nname: a\n---\n\n[x](../skills/makers-b/references/x.md)\n',
    'makers-b/references/x.md': '# X\n',
  });
  try {
    const broken = findBrokenLinks(root);
    assert.equal(broken.length, 1);
    assert.equal(broken[0].target, '../skills/makers-b/references/x.md');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findBrokenLinks ignores http links and strips anchors', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md':
      '---\nname: a\n---\n\n[web](https://example.com/a.md) [anchor](references/kv.md#section)\n',
    'makers-a/references/kv.md': '# KV\n',
  });
  try {
    assert.deepEqual(findBrokenLinks(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
