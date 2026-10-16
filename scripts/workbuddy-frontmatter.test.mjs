import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SKILL_PATH = 'skills/edgeone-makers-tools/SKILL.md';
const META_PATH = '_meta.json';
const REQUIRED_FIELDS = [
  'name',
  'version',
  'display_name',
  'display_name_en',
  'description_zh',
  'description_en',
];

function readFrontmatter(path) {
  const content = readFileSync(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  assert.ok(match, `${path} must start with YAML frontmatter`);
  return match[1];
}

test('WorkBuddy package entry declares all required frontmatter fields', () => {
  const frontmatter = readFrontmatter(SKILL_PATH);

  for (const field of REQUIRED_FIELDS) {
    assert.match(
      frontmatter,
      new RegExp(`^${field}:\\s*.+$`, 'm'),
      `SKILL.md is missing WorkBuddy field: ${field}`,
    );
  }
});

test('WorkBuddy package version matches the publish manifest', () => {
  const frontmatter = readFrontmatter(SKILL_PATH);
  const version = /^version:\s*["']?([^"'\s]+)["']?$/m.exec(frontmatter)?.[1];
  const metadata = JSON.parse(readFileSync(META_PATH, 'utf8'));

  assert.equal(version, metadata.version);
});
