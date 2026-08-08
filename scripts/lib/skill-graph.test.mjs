import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  findBrokenLinks,
  findDanglingSkillNames,
  findDeepReferenceLinks,
  listMarkdownFiles,
} from './skill-graph.mjs';

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

test('skill-graph.findBrokenLinks fails with a readable message on a bad root', async () => {
  const root = await makeSkills({ 'makers-a/SKILL.md': '---\nname: a\n---\n' });
  try {
    assert.throws(() => findBrokenLinks(join(root, 'no-such-dir')), {
      message: /root directory not found/,
    });
    // 传文件而不是目录:原来会抛 ENOTDIR 裸栈。
    assert.throws(() => findBrokenLinks(join(root, 'makers-a/SKILL.md')), {
      message: /not a directory/,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findBrokenLinks keeps scanning when one file is unreadable', async () => {
  const root = await makeSkills({
    'makers-a/locked.md': '# locked\n',
    'makers-b/SKILL.md': '---\nname: b\n---\n\n[gone](missing.md)\n',
  });
  const locked = join(root, 'makers-a/locked.md');
  try {
    await chmod(locked, 0o000);
    const broken = findBrokenLinks(root);

    // 后面那个文件的断链仍被发现,没有被前面的权限错误带走整轮扫描。
    assert.ok(
      broken.some((item) => item.file === 'makers-b/SKILL.md' && item.target === 'missing.md'),
    );
    // 读不到的文件被单独记录,而不是静默当成“没有断链”。
    const unreadable = broken.find((item) => item.file === 'makers-a/locked.md');
    assert.equal(unreadable.line, 0);
    assert.equal(unreadable.target, null);
    assert.match(unreadable.error, /EACCES/);
  } finally {
    // 先恢复权限,否则 rm 清不掉这棵树。
    await chmod(locked, 0o644);
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.listMarkdownFiles returns globally sorted paths', async () => {
  const root = await makeSkills({
    'a/z.md': '# z\n',
    'a-b.md': '# a-b\n',
    'b/c.md': '# c\n',
  });
  try {
    assert.deepEqual(listMarkdownFiles(root), ['a-b.md', 'a/z.md', 'b/c.md']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findDanglingSkillNames flags a name no skill declares', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md': '---\nname: edgeone-makers-a\n---\n\nUse edgeone-pages-dev instead.\n',
  });
  try {
    assert.deepEqual(findDanglingSkillNames(root), [
      { file: 'makers-a/SKILL.md', line: 5, name: 'edgeone-pages-dev' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findDanglingSkillNames catches a dangling name inside description', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md':
      '---\nname: edgeone-makers-a\ndescription: >-\n  Do NOT trigger for X (use edgeone-makers-dev instead).\n---\n\nBody.\n',
  });
  try {
    const dangling = findDanglingSkillNames(root);
    assert.equal(dangling.length, 1);
    assert.equal(dangling[0].name, 'edgeone-makers-dev');
    assert.equal(dangling[0].line, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findDanglingSkillNames accepts declared names and the marketplace slug', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md':
      '---\nname: edgeone-makers-a\n---\n\nSee edgeone-makers-b and edgeone-makers-tools.\n',
    'makers-b/SKILL.md': '---\nname: edgeone-makers-b\n---\n\nHi.\n',
  });
  try {
    assert.deepEqual(findDanglingSkillNames(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findDeepReferenceLinks flags links that climb two levels', async () => {
  const root = await makeSkills({
    'makers-a/references/x.md': 'See [y](../../makers-b/references/y.md).\n',
    'makers-b/references/y.md': '# Y\n',
  });
  try {
    assert.deepEqual(findDeepReferenceLinks(root), [
      { file: 'makers-a/references/x.md', line: 1, target: '../../makers-b/references/y.md' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findDeepReferenceLinks allows single-level parent links', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md': '---\nname: a\n---\n\n[y](../makers-b/references/y.md)\n',
    'makers-b/references/y.md': '# Y\n',
  });
  try {
    assert.deepEqual(findDeepReferenceLinks(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
