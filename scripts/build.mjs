#!/usr/bin/env node
/**
 * Build script: generate multi-platform output from skills/ source.
 * - Cursor rules (cursor/rules/*.mdc)
 * - Codex skills (codex/*.md)
 * - Validate all routed capability files have required frontmatter
 */
import fs from 'fs';
import path from 'path';

// WorkBuddy-compatible layout: the one skill lives at skills/edgeone-makers-tools/,
// and each capability is a flat markdown file under references/. Generate one
// Cursor rule / Codex skill for each routed capability file.
const SKILL_ROOT = path.resolve('skills/edgeone-makers-tools');
const SKILLS_DIR = path.resolve('skills/edgeone-makers-tools/references');
const ROUTER_PATH = path.resolve('skills/edgeone-makers-tools/SKILL.md');
const CURSOR_RULES_DIR = path.resolve('cursor/rules');
const CODEX_DIR = path.resolve('codex');

function getSkillFiles() {
  const router = fs.readFileSync(ROUTER_PATH, 'utf-8');
  const files = [...router.matchAll(/references\/([^\s)|]+\.md)/g)]
    .map((match) => match[1]);
  return [...new Set(files)].sort();
}

function getSkillName(skillFile) {
  return skillFile.slice(0, -'.md'.length);
}

function readSkillMd(skillFile) {
  const skillPath = path.join(SKILLS_DIR, skillFile);
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf-8');
}

function validateWorkBuddyLayout() {
  const errors = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(SKILL_ROOT, fullPath);
      const directoryDepth = path.dirname(relativePath) === '.'
        ? 0
        : path.dirname(relativePath).split(path.sep).length;
      if (directoryDepth > 1) {
        errors.push(`${relativePath}: WorkBuddy allows only one child directory level`);
      }
    }
  }
  walk(SKILL_ROOT);
  return errors;
}

// Generate Cursor rules (.mdc format)
function generateCursorRules() {
  fs.mkdirSync(CURSOR_RULES_DIR, { recursive: true });
  for (const skillFile of getSkillFiles()) {
    const skill = getSkillName(skillFile);
    const content = readSkillMd(skillFile);
    if (!content) continue;
    const outPath = path.join(CURSOR_RULES_DIR, `${skill}.mdc`);
    fs.writeFileSync(outPath, content);
    console.log(`  → ${outPath}`);
  }
}

// Generate Codex skills
function generateCodexSkills() {
  fs.mkdirSync(CODEX_DIR, { recursive: true });
  for (const skillFile of getSkillFiles()) {
    const skill = getSkillName(skillFile);
    const content = readSkillMd(skillFile);
    if (!content) continue;
    const outPath = path.join(CODEX_DIR, `${skill}.md`);
    fs.writeFileSync(outPath, content);
    console.log(`  → ${outPath}`);
  }
}

// Validate
function validate() {
  const errors = [];
  for (const skillFile of getSkillFiles()) {
    const skill = getSkillName(skillFile);
    const content = readSkillMd(skillFile);
    if (!content) {
      errors.push(`${skill}: missing capability file`);
      continue;
    }
    if (!content.startsWith('---')) {
      errors.push(`${skill}: missing frontmatter`);
    }
    if (!content.includes('name:')) {
      errors.push(`${skill}: missing name in frontmatter`);
    }
  }
  return errors;
}

console.log('🔍 Validating skills...');
const errors = [...validateWorkBuddyLayout(), ...validate()];
if (errors.length > 0) {
  console.error('❌ Validation errors:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`✅ ${getSkillFiles().length} skills validated`);

console.log('\n📝 Generating Cursor rules...');
generateCursorRules();

console.log('\n📝 Generating Codex skills...');
generateCodexSkills();

console.log('\n✅ Build complete');
