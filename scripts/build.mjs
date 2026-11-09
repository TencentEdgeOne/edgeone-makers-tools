#!/usr/bin/env node
/**
 * Build script: generate multi-platform output from skills/ source.
 * - Cursor rules (cursor/rules/*.mdc)
 * - Codex skills (codex/*.md)
 * - Validate the WorkBuddy package layout and required frontmatter
 */
import fs from 'fs';
import path from 'path';

// WorkBuddy publishing layout: one router and flat reference documents.
// Generate one Cursor rule / Codex guide per routed capability.
const SKILLS_DIR = path.resolve('skills/edgeone-makers-tools/references');
const SKILL_ROOT = path.dirname(SKILLS_DIR);
const ROUTER_PATH = path.join(SKILL_ROOT, 'SKILL.md');
const REQUIRED_WORKBUDDY_FIELDS = [
  'name', 'display_name', 'display_name_en', 'description',
  'description_zh', 'description_en', 'version', 'author',
];
const CURSOR_RULES_DIR = path.resolve('cursor/rules');
const CODEX_DIR = path.resolve('codex');

function getSkillFiles() {
  const router = fs.readFileSync(ROUTER_PATH, 'utf-8');
  const files = [...router.matchAll(/references\/([^\s)|`]+\.md)/g)]
    .map(match => match[1]);
  return [...new Set(files)].sort();
}

function readSkillMd(skillFile) {
  const skillPath = path.join(SKILLS_DIR, skillFile);
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf-8');
}

function contentForOutput(skill, outPath) {
  const content = readSkillMd(skill);
  if (!content) return null;
  return content.replace(/\]\(([^)]+)\)/g, (match, target) => {
    if (target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target) || /^<[^>]+>$/.test(target)) return match;
    const hashIndex = target.indexOf('#');
    const file = hashIndex < 0 ? target : target.slice(0, hashIndex);
    const anchor = hashIndex < 0 ? '' : target.slice(hashIndex);
    if (!file || !file.endsWith('.md')) return match;
    const resolved = path.resolve(SKILLS_DIR, file);
    if (!fs.existsSync(resolved)) throw new Error(`${skill}: unresolved reference ${target}`);
    return `](${path.relative(path.dirname(outPath), resolved).split(path.sep).join('/')}${anchor})`;
  });
}

// Generate Cursor rules (.mdc format)
function generateCursorRules() {
  fs.mkdirSync(CURSOR_RULES_DIR, { recursive: true });
  for (const skillFile of getSkillFiles()) {
    const outPath = path.join(CURSOR_RULES_DIR, `${skillFile.slice(0, -3)}.mdc`);
    const content = contentForOutput(skillFile, outPath);
    if (!content) continue;
    fs.writeFileSync(outPath, content);
    console.log(`  → ${outPath}`);
  }
}

// Generate Codex skills
function generateCodexSkills() {
  fs.mkdirSync(CODEX_DIR, { recursive: true });
  for (const skillFile of getSkillFiles()) {
    const outPath = path.join(CODEX_DIR, `${skillFile.slice(0, -3)}.md`);
    const content = contentForOutput(skillFile, outPath);
    if (!content) continue;
    fs.writeFileSync(outPath, content);
    console.log(`  → ${outPath}`);
  }
}

function validateWorkBuddyPackage() {
  const errors = [];
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(ROUTER_PATH, 'utf-8'))?.[1] || '';
  for (const field of REQUIRED_WORKBUDDY_FIELDS) {
    if (!new RegExp(`^${field}:[ \\t]*\\S`, 'm').test(frontmatter)) {
      errors.push(`SKILL.md: missing WorkBuddy frontmatter field ${field}`);
    }
  }
  function walk(dir, depth) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth >= 1) errors.push(`${path.relative(SKILL_ROOT, fullPath)}: WorkBuddy allows only one child directory level`);
        else walk(fullPath, depth + 1);
      }
    }
  }
  walk(SKILL_ROOT, 0);
  return errors;
}

// Validate
function validate() {
  const errors = [];
  for (const skill of getSkillFiles()) {
    const content = readSkillMd(skill);
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
const errors = [...validateWorkBuddyPackage(), ...validate()];
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
