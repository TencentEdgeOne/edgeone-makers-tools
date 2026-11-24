import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const refs = 'skills/edgeone-makers-tools/references';
const read = (file) => readFileSync(path.join(root, refs, file), 'utf8');
const files = [
  'makers-cli/SKILL.md', 'makers-deploy/SKILL.md',
  'makers-deploy/references/anonymous-deploy.md', 'makers-deploy/references/command-reference.md',
  'makers-env-adaption/SKILL.md', 'makers-agents/SKILL.md', 'makers-storage/references/kv.md',
];

test('platform selection distinguishes the host from model, SDK and distribution channel', () => {
  const cli = read('makers-cli/SKILL.md');
  for (const platform of ['skill-workbuddy', 'skill-claude', 'skill-cursor', 'skill-codex', 'skill-codebuddy', 'skill-unknown']) {
    assert.ok(cli.includes(platform), platform);
  }
  assert.match(cli, /Claude Code/);
  assert.match(cli, /SkillHub.*distribution channel/i);
  assert.match(cli, /Do not infer.*SDK|Do not infer.*model/i);
  assert.match(cli, /--platform.*PAGES_SOURCE.*cli/s);
  assert.match(cli, /does not select.*workspace/i);
  assert.match(cli, /MCP.*does not.*inherit|MCP.*not.*inherit/s);
});

test('deploy flags are gated by actual CLI capability without assuming a development build is released', () => {
  const cli = read('makers-cli/SKILL.md');
  assert.match(cli, /edgeone makers deploy --help/);
  assert.match(cli, /--platform/);
  assert.match(cli, /not.*proof.*--platform/s);
  assert.match(cli, /do not silently drop.*--platform/i);
  assert.match(cli, /public.*release|released.*version/);
});

test('every standalone deployment shell example carries an explicit platform', () => {
  for (const file of files) {
    const text = read(file);
    const blocks = [...text.matchAll(/```(?:bash|sh|shell)\n([\s\S]*?)```/g)].map((match) => match[1]);
    for (const block of blocks) {
      for (const line of block.split('\n')) {
        if (/^\s*(?:PAGES_SOURCE=skills\s+)?edgeone\s+(?:makers|pages)\s+deploy(?:\s|$)/.test(line) && !line.includes('--help')) {
          assert.match(line, /--platform\s+(?:skill-[a-z-]+|<platform>)/, `${file}: ${line}`);
        }
      }
    }
  }
  assert.match(read('makers-env-adaption/SKILL.md'), /edgeone makers deploy[^\n]*--platform skill-workbuddy/);
});

test('generated guides retain attribution rules and remain host-neutral', () => {
  for (const platformDir of ['codex', 'cursor/rules']) {
    const extension = platformDir === 'codex' ? 'md' : 'mdc';
    const cli = readFileSync(path.join(root, platformDir, `makers-cli.${extension}`), 'utf8');
    assert.match(cli, /skill-workbuddy/);
    assert.match(cli, /skill-unknown/);
    for (const name of ['makers-deploy', 'makers-env-adaption', 'makers-agents']) {
      const text = readFileSync(path.join(root, platformDir, `${name}.${extension}`), 'utf8');
      assert.match(text, /--platform/);
    }
  }
});
