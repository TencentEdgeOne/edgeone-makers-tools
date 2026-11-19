import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildClaudePackage, normalizeFrontmatter, packClaudePlugin } from './build-claude-package.mjs';
import { findBrokenLinks, listMarkdownFiles } from './lib/skill-graph.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  }).sort();
}

test('Claude frontmatter keeps only name and plain description, leaving the body unchanged', () => {
  const source = '---\nslug: demo\nname: demo\ndescription: >-\n  First line\n  second line\nvalidate:\n  - pattern: forbidden\nmetadata:\n  version: "1"\n---\n\n# Body\nKeep this instruction.\n';
  assert.equal(normalizeFrontmatter(source), '---\nname: "demo"\ndescription: "First line second line"\n---\n\n# Body\nKeep this instruction.\n');
  assert.equal(normalizeFrontmatter('# Reference\n'), '# Reference\n');
  assert.throws(() => normalizeFrontmatter('---\nname: demo\n---\nBody'), /description/);
});

test('Claude export contains the complete skill without hooks, executable files, packages or private caches', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'makers-claude-test-'));
  try {
    const output = path.join(parent, 'package');
    buildClaudePackage({ root, output });
    const published = files(output);
    const sourceRoot = path.join(root, 'skills/edgeone-makers-tools');
    const targetRoot = path.join(output, 'skills/edgeone-makers-tools');
    assert.deepEqual(listMarkdownFiles(targetRoot), listMarkdownFiles(sourceRoot));
    assert.deepEqual(findBrokenLinks(targetRoot), []);
    for (const file of published) {
      const relative = path.relative(output, file).split(path.sep).join('/');
      assert.ok(relative === '.claude-plugin/plugin.json' || relative === '.claude-plugin/icon.png' || relative === 'LICENSE' || /^skills\/edgeone-makers-tools\/.+\.md$/.test(relative), relative);
      assert.doesNotMatch(relative, /(?:hooks|scripts|node_modules|\.claude\/|\.codebuddy\/|package(?:-lock)?\.json)/);
      if (!file.endsWith('.md')) continue;
      const source = readFileSync(path.join(sourceRoot, path.relative(targetRoot, file)), 'utf8');
      const text = readFileSync(file, 'utf8');
      assert.equal(text, normalizeFrontmatter(source));
      assert.doesNotMatch(text, /hooks\/hooks\.json|validate-write\.mjs|signal-log\.mjs|UserPromptSubmit|PreToolUse/);
      assert.ok(!text.includes('\0'));
    }
    const manifest = JSON.parse(readFileSync(path.join(output, '.claude-plugin/plugin.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest).sort(), ['author', 'description', 'icon', 'name', 'version']);
    assert.equal(manifest.icon, './.claude-plugin/icon.png');
    const icon = readFileSync(path.join(output, '.claude-plugin/icon.png'));
    assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(icon.readUInt32BE(16), 512);
    assert.equal(icon.readUInt32BE(20), 512);
    assert.ok(icon.length < 2 * 1024 * 1024);
    mkdirSync(path.join(output, 'hooks'));
    writeFileSync(path.join(output, 'hooks', 'stale.mjs'), 'stale');
    assert.throws(() => buildClaudePackage({ root, output }), /Unexpected published file/);
    assert.throws(() => buildClaudePackage({ root, output: path.join(root, 'skills') }), /outside the source tree/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('all platform manifests and test commands are independent of removed runtime hooks', () => {
  const codebuddy = JSON.parse(readFileSync(path.join(root, '.codebuddy-plugin/marketplace.json'), 'utf8'));
  assert.ok(!Object.hasOwn(codebuddy.plugins[0], 'hooks'));
  assert.deepEqual(codebuddy.plugins[0].skills, ['./skills/edgeone-makers-tools']);
  assert.doesNotMatch(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.test, /hooks\//);
  assert.ok(!readdirSync(root, { withFileTypes: true }).some(entry => entry.name === 'hooks' && files(path.join(root, entry.name)).length));
});

test('the archive contains the clean plugin at its root and requires no checked-in copy', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'makers-archive-test-'));
  try {
    const output = path.join(parent, 'plugin.zip');
    const result = packClaudePlugin({ root, output });
    assert.equal(result.output, output);
    assert.ok(!existsSync(result.stagingDirectory));
    execFileSync('unzip', ['-tq', output]);
    const entries = execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' }).trim().split('\n');
    assert.ok(entries.includes('.claude-plugin/plugin.json'));
    assert.ok(entries.includes('skills/edgeone-makers-tools/SKILL.md'));
    assert.ok(entries.every(entry => !entry.startsWith('/') && !entry.split('/').includes('..')));
    assert.ok(entries.filter(entry => !entry.endsWith('/')).every(entry => entry === '.claude-plugin/plugin.json' || entry === '.claude-plugin/icon.png' || entry === 'LICENSE' || /^skills\/edgeone-makers-tools\/.+\.md$/.test(entry)));
    const extracted = path.join(parent, 'extracted');
    execFileSync('unzip', ['-q', output, '-d', extracted]);
    const sourceRoot = path.join(root, 'skills/edgeone-makers-tools');
    const skillRoot = path.join(extracted, 'skills/edgeone-makers-tools');
    assert.deepEqual(listMarkdownFiles(skillRoot), listMarkdownFiles(sourceRoot));
    assert.deepEqual(findBrokenLinks(skillRoot), []);
    for (const file of listMarkdownFiles(skillRoot)) {
      assert.equal(readFileSync(path.join(skillRoot, file), 'utf8'), normalizeFrontmatter(readFileSync(path.join(sourceRoot, file), 'utf8')));
    }
    packClaudePlugin({ root, output });
    assert.deepEqual(execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' }).trim().split('\n'), entries);
    for (const output of ['skills/plugin.zip', 'dist/plugin.zip']) {
      assert.throws(() => packClaudePlugin({ root, output: path.join(root, output) }), /outside the source tree/);
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
  const marketplace = JSON.parse(readFileSync(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(marketplace.plugins[0].source, './');
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['package:claude'], 'node scripts/build-claude-package.mjs');
});

test('default Claude archive is a sibling of the repository and leaves its contents unchanged', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'makers-archive-default-test-'));
  try {
    const fixtureRoot = path.join(parent, 'repository');
    for (const entry of ['skills/edgeone-makers-tools', '.claude-plugin', 'LICENSE']) {
      cpSync(path.join(root, entry), path.join(fixtureRoot, entry), { recursive: true });
    }
    const before = files(fixtureRoot);
    const result = packClaudePlugin({ root: fixtureRoot });
    assert.equal(result.output, path.join(parent, 'edgeone-makers-tools-claude.zip'));
    execFileSync('unzip', ['-tq', result.output]);
    assert.deepEqual(files(fixtureRoot), before);
    assert.ok(!existsSync(result.stagingDirectory));
    assert.ok(!existsSync(path.join(root, 'plugins/claude-skills-only')));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
