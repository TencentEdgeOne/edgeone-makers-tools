#!/usr/bin/env node
/**
 * Build script: generate multi-platform output from skills/ source.
 * - Cursor rules (cursor/rules/*.mdc)
 * - Codex skills (codex/*.md)
 * - Validate all skill SKILL.md files have required frontmatter
 */
import fs from 'fs';
import path from 'path';

const SKILLS_DIR = path.resolve('skills');
const CURSOR_RULES_DIR = path.resolve('cursor/rules');
const CODEX_DIR = path.resolve('codex');

function getSkillDirs() {
  return fs.readdirSync(SKILLS_DIR)
    .filter(name => fs.statSync(path.join(SKILLS_DIR, name)).isDirectory())
    .sort();
}

function readSkillMd(skillDir) {
  const skillPath = path.join(SKILLS_DIR, skillDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf-8');
}

// Generate Cursor rules (.mdc format)
function generateCursorRules() {
  fs.mkdirSync(CURSOR_RULES_DIR, { recursive: true });
  for (const skill of getSkillDirs()) {
    const content = readSkillMd(skill);
    if (!content) continue;
    const outPath = path.join(CURSOR_RULES_DIR, `${skill}.mdc`);
    fs.writeFileSync(outPath, content);
    console.log(`  → ${outPath}`);
  }
}

// Generate Codex skills
function generateCodexSkills() {
  fs.mkdirSync(CODEX_DIR, { recursive: true });
  for (const skill of getSkillDirs()) {
    const content = readSkillMd(skill);
    if (!content) continue;
    const outPath = path.join(CODEX_DIR, `${skill}.md`);
    fs.writeFileSync(outPath, content);
    console.log(`  → ${outPath}`);
  }
}

// Validate
function validate() {
  const errors = [];
  for (const skill of getSkillDirs()) {
    const content = readSkillMd(skill);
    if (!content) {
      errors.push(`${skill}: missing SKILL.md`);
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
const errors = validate();
if (errors.length > 0) {
  console.error('❌ Validation errors:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`✅ ${getSkillDirs().length} skills validated`);

console.log('\n📝 Generating Cursor rules...');
generateCursorRules();

console.log('\n📝 Generating Codex skills...');
generateCodexSkills();

console.log('\n✅ Build complete');
