import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  listDeclaredSkillNames,
  checkFileManifest,
  findBrokenLinks,
  findDanglingSkillNames,
  findDeepReferenceLinks,
  findMissingTocs,
  findOversizedFiles,
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

test('skill-graph.findDanglingSkillNames ignores a name that only appears inside an anchor slug', async () => {
  const root = await makeSkills({
    'makers-a/references/long.md':
      '# Long\n\n- [Remediation: from Vercel style to EdgeOne Makers style](#remediation-from-vercel-style-to-edgeone-makers-style)\n\n## Remediation: from Vercel style to EdgeOne Makers style\n',
  });
  try {
    assert.deepEqual(findDanglingSkillNames(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findDanglingSkillNames still flags a real name on a line that also has an anchor link', async () => {
  const root = await makeSkills({
    'makers-a/references/long.md':
      '# Long\n\nUse edgeone-pages-dev, see [Setup](#setup-edgeone-makers-style).\n\n## Setup edgeone makers style\n',
  });
  try {
    const dangling = findDanglingSkillNames(root);
    assert.equal(dangling.length, 1);
    assert.equal(dangling[0].name, 'edgeone-pages-dev');
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

test('skill-graph.findDeepReferenceLinks ignores a dotted dir name that only looks like two levels', async () => {
  const root = await makeSkills({
    // `..../` 是个普通目录名,不是爬升两级;DEEP_PARENT_LINK 的 (^|/) 守卫就为这个。
    'makers-a/SKILL.md': '---\nname: a\n---\n\n[x](..../../a.md)\n',
  });
  try {
    assert.deepEqual(findDeepReferenceLinks(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findDanglingSkillNames survives an unreadable or non-file SKILL.md', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md': '---\nname: edgeone-makers-a\n---\n',
    'makers-b/SKILL.md': '---\nname: edgeone-makers-b\n---\n\nUse edgeone-pages-dev.\n',
  });
  const locked = join(root, 'makers-a/SKILL.md');
  try {
    await chmod(locked, 0o000);
    // SKILL.md 是个目录:原来会抛 EISDIR。
    await mkdir(join(root, 'makers-c/SKILL.md'), { recursive: true });

    // 不抛——doctor 的六项检查不该被一个权限异常的文件换成裸栈。
    const dangling = findDanglingSkillNames(root);

    // 其余文件照常检查,没有被前面的权限错误带走整轮扫描。
    assert.deepEqual(dangling, [
      { file: 'makers-b/SKILL.md', line: 5, name: 'edgeone-pages-dev' },
    ]);
  } finally {
    // 先恢复权限,否则 rm 清不掉这棵树。
    await chmod(locked, 0o644);
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs flags a long reference without a table of contents', async () => {
  const body = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n');
  const root = await makeSkills({ 'makers-a/references/long.md': `# Long\n\n${body}\n` });
  try {
    assert.deepEqual(findMissingTocs(root), [
      { file: 'makers-a/references/long.md', lines: 123 },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs accepts a long reference that opens with anchor links', async () => {
  const body = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n');
  const root = await makeSkills({
    'makers-a/references/long.md': `# Long\n\n- [One](#one)\n- [Two](#two)\n\n${body}\n`,
  });
  try {
    assert.deepEqual(findMissingTocs(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs ignores short references and SKILL.md', async () => {
  const body = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n');
  const root = await makeSkills({
    'makers-a/references/short.md': '# Short\n\nonly a few lines\n',
    'makers-a/SKILL.md': `---\nname: a\n---\n\n${body}\n`,
  });
  try {
    assert.deepEqual(findMissingTocs(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findOversizedFiles flags files above the 500-line cap', async () => {
  const skillBody = Array.from({ length: 520 }, (_, i) => `s ${i}`).join('\n');
  const refBody = Array.from({ length: 520 }, (_, i) => `r ${i}`).join('\n');
  const root = await makeSkills({
    'makers-a/SKILL.md': `---\nname: a\n---\n${skillBody}\n`,
    'makers-a/references/big.md': `# Big\n${refBody}\n`,
  });
  try {
    const over = findOversizedFiles(root);
    assert.deepEqual(over.map((x) => x.file).sort(), [
      'makers-a/SKILL.md',
      'makers-a/references/big.md',
    ]);
    assert.ok(over.every((x) => x.lines > 500 && x.cap === 500));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs and findOversizedFiles survive an unreadable file', async () => {
  const body = Array.from({ length: 600 }, (_, i) => `line ${i}`).join('\n');
  const root = await makeSkills({
    // 这个读不到:既够长会被目录检测盯上,也超 500 行会被行数检测盯上。
    'makers-a/references/locked.md': `# Locked\n\n${body}\n`,
    'makers-b/references/plain.md': `# Plain\n\n${body}\n`,
  });
  const locked = join(root, 'makers-a/references/locked.md');
  try {
    await chmod(locked, 0o000);

    // 不抛——doctor 调 collect() 没有 try/catch,一个权限异常的文件
    // 不该把整份六项报告换成裸栈。
    const missing = findMissingTocs(root);
    const over = findOversizedFiles(root);

    // 读不到的文件被跳过,不凭空报一条。
    assert.deepEqual(
      missing.map((x) => x.file),
      ['makers-b/references/plain.md'],
    );
    assert.deepEqual(
      over.map((x) => x.file),
      ['makers-b/references/plain.md'],
    );
  } finally {
    // 先恢复权限,否则 rm 清不掉这棵树。
    await chmod(locked, 0o644);
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.checkFileManifest reports files on disk but absent from the manifest', async () => {
  const root = await makeSkills({
    'makers-a/SKILL.md': '---\nname: a\n---\n',
    'makers-a/references/x.md': '# X\n',
  });
  try {
    assert.deepEqual(checkFileManifest(root, ['skills/makers-a/SKILL.md']), {
      missing: ['skills/makers-a/references/x.md'],
      extra: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.checkFileManifest reports manifest entries with no file on disk', async () => {
  const root = await makeSkills({ 'makers-a/SKILL.md': '---\nname: a\n---\n' });
  try {
    assert.deepEqual(
      checkFileManifest(root, ['skills/makers-a/SKILL.md', 'skills/makers-ghost/SKILL.md']),
      { missing: [], extra: ['skills/makers-ghost/SKILL.md'] },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.checkFileManifest ignores manifest entries outside skills/', async () => {
  const root = await makeSkills({ 'makers-a/SKILL.md': '---\nname: a\n---\n' });
  try {
    assert.deepEqual(
      checkFileManifest(root, ['SKILL.md', 'CLAUDE.md', 'skills/makers-a/SKILL.md']),
      { missing: [], extra: [] },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** 造一个正文足够长(必然超过目录阈值)的 reference,可选地在开头插几行。 */
function longReference(head = '') {
  const body = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n');
  return `# Long\n\n${head}${body}\n`;
}

test('skill-graph.findMissingTocs accepts an ordered-list table of contents', async () => {
  // `1.` 这一支单独钉住:去掉 ANCHOR_LIST_ITEM 里的 \d+\. 分支后本用例才会红。
  const root = await makeSkills({
    'makers-a/references/long.md': longReference('1. [One](#one)\n2. [Two](#two)\n\n'),
  });
  try {
    assert.deepEqual(findMissingTocs(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs accepts a star-bulleted table of contents', async () => {
  // `*` 这一支单独钉住:去掉 [-*] 里的 * 后本用例才会红。
  const root = await makeSkills({
    'makers-a/references/long.md': longReference('* [One](#one)\n* [Two](#two)\n\n'),
  });
  try {
    assert.deepEqual(findMissingTocs(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs still flags a long file whose prose merely links an anchor', async () => {
  // 最危险的方向:漏报意味着 Task 15 永远不会给它补目录。
  // 正文里的行内锚点链接不是目录——它不在行首,ANCHOR_LIST_ITEM 的 ^ 与列表符号要求就为这个。
  const root = await makeSkills({
    'makers-a/references/long.md': longReference('See [below](#tail) for details.\n\n'),
  });
  try {
    assert.deepEqual(
      findMissingTocs(root).map((x) => x.file),
      ['makers-a/references/long.md'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs still flags a long file whose only list link is not an anchor', async () => {
  // 列表项里放的是普通文件链接而非 #锚点,不算目录:钉住 ANCHOR_LIST_ITEM 结尾的 \(# 要求。
  const root = await makeSkills({
    'makers-a/references/long.md': longReference('- [One](one.md)\n- [Two](two.md)\n\n'),
    'makers-a/references/one.md': '# One\n',
    'makers-a/references/two.md': '# Two\n',
  });
  try {
    assert.deepEqual(
      findMissingTocs(root).map((x) => x.file),
      ['makers-a/references/long.md'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs still flags a long file whose mid-line dash precedes an anchor link', async () => {
  // 钉住 ANCHOR_LIST_ITEM 的 ^:没有 ^ 时,这行里的「 - [Two](#two)」会被当成行首列表项,
  // 于是一段普通散文被误认成目录(漏报),Task 15 就永远不会给它补目录。
  const root = await makeSkills({
    'makers-a/references/long.md': longReference('Compare A - [Two](#two) is inline prose.\n\n'),
  });
  try {
    assert.deepEqual(
      findMissingTocs(root).map((x) => x.file),
      ['makers-a/references/long.md'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs treats 100 lines as short and 101 as long', async () => {
  // 钉住 <= TOC_LINE_THRESHOLD 这道边界(而非 < )。
  // 行数是 split 段数:99 个 \n + 结尾换行 = 100 段。
  const root = await makeSkills({
    'makers-a/references/at-100.md': `${Array.from({ length: 99 }, (_, i) => `a ${i}`).join('\n')}\n`,
    'makers-b/references/at-101.md': `${Array.from({ length: 100 }, (_, i) => `b ${i}`).join('\n')}\n`,
  });
  try {
    assert.deepEqual(findMissingTocs(root), [
      { file: 'makers-b/references/at-101.md', lines: 101 },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findOversizedFiles treats 500 lines as fine and 501 as oversized', async () => {
  // 钉住 > MAX_FILE_LINES 这道边界(而非 >= )。
  const root = await makeSkills({
    'makers-a/references/at-500.md': `${Array.from({ length: 499 }, (_, i) => `a ${i}`).join('\n')}\n`,
    'makers-b/references/at-501.md': `${Array.from({ length: 500 }, (_, i) => `b ${i}`).join('\n')}\n`,
  });
  try {
    assert.deepEqual(findOversizedFiles(root), [
      { file: 'makers-b/references/at-501.md', lines: 501, cap: 500 },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findMissingTocs only exempts a real SKILL.md, not a lookalike filename', async () => {
  // endsWith('SKILL.md') 会把 MY-SKILL.md 一起豁免,而 Task 15 拿这个检测当验收门,
  // 于是这种文件永远补不上目录也没人报。
  const root = await makeSkills({
    'makers-a/references/MY-SKILL.md': longReference(),
    'makers-a/SKILL.md': `---\nname: a\n---\n\n${longReference()}`,
  });
  try {
    assert.deepEqual(
      findMissingTocs(root).map((x) => x.file),
      ['makers-a/references/MY-SKILL.md'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.listDeclaredSkillNames collects names from nested SKILL.md files', async () => {
  // 单 skill 路由布局：路由页在顶层，各能力的 SKILL.md 藏在 references/ 下。
  const root = await makeSkills({
    'tools/SKILL.md': '---\nname: edgeone-makers-tools\n---\n',
    'tools/references/cap-a/SKILL.md': '---\nname: edgeone-makers-a\n---\n',
    'tools/references/cap-b/SKILL.md': '---\nname: edgeone-makers-b\n---\n',
  });
  try {
    assert.deepEqual(
      [...listDeclaredSkillNames(root)].sort(),
      ['edgeone-makers-a', 'edgeone-makers-b', 'edgeone-makers-tools'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skill-graph.findDanglingSkillNames accepts nested declarations in a single-router layout', async () => {
  const root = await makeSkills({
    'tools/SKILL.md': '---\nname: edgeone-makers-tools\n---\n\nSee edgeone-makers-a.\n',
    'tools/references/cap-a/SKILL.md': '---\nname: edgeone-makers-a\n---\n\nUse edgeone-pages-ghost.\n',
  });
  try {
    const dangling = findDanglingSkillNames(root);
    assert.equal(dangling.length, 1);
    assert.equal(dangling[0].name, 'edgeone-pages-ghost');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
