#!/usr/bin/env node
/**
 * 一次性工具：为超 100 行、且开头没有锚点目录的 reference 插入目录。
 * 目录由文件自身的标题生成，插在 H1 之后、第一段正文之前。
 *
 * 工作清单直接取自 findMissingTocs，保证生成器与验收闸门用同一套判定，
 * 不会出现「脚本认为加过了、doctor 仍然报缺」的分歧。
 *
 * 幂等：已有目录的文件不会出现在 findMissingTocs 结果里，重跑即零改动。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findMissingTocs } from './lib/skill-graph.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(REPO_ROOT, 'skills');

/** GitHub 风格锚点：小写、去标点、空格转连字符。保留 CJK。 */
export function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w一-龥\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * 提取指定层级的标题，跳过代码块内的 #。
 * level 为 2 取 `## `，为 3 取 `### `。
 */
export function extractHeadings(lines, level = 2) {
  const pattern = new RegExp(`^#{${level}}\\s+(.+?)\\s*$`);
  const headings = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = pattern.exec(line);
    if (match) headings.push({ text: match[1], line: index });
  });
  return headings;
}

/**
 * 返回插入目录后的完整文本；两个层级都凑不出 2 条标题时原样返回。
 *
 * `##` 不足 2 条时回退到 `###`：capabilities/tools.md 就是这种结构
 * （1 个 `##` + 9 个 `###`），不回退的话它永远留在 findMissingTocs 里，
 * doctor 也就永远转不了绿。只回退、不混层，免得目录深浅不一。
 */
export function withToc(content) {
  const lines = content.split(/\r?\n/);
  let headings = extractHeadings(lines, 2);
  if (headings.length < 2) headings = extractHeadings(lines, 3);
  if (headings.length < 2) return content;

  const toc = ['## Contents', '', ...headings.map((h) => `- [${h.text}](#${slugify(h.text)})`), ''];

  // 插入点：H1 之后的首个非空行之前；没有 H1 就插到文件开头。
  let insertAt = 0;
  if (/^#\s+/.test(lines[0])) {
    insertAt = 1;
    while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt += 1;
  }
  return [...lines.slice(0, insertAt), ...toc, ...lines.slice(insertAt)].join('\n');
}

function main() {
  const targets = findMissingTocs(SKILLS_DIR);
  let changed = 0;
  for (const { file } of targets) {
    const abs = join(SKILLS_DIR, file);
    const before = readFileSync(abs, 'utf8');
    const after = withToc(before);
    if (after !== before) {
      writeFileSync(abs, after);
      changed += 1;
      console.log(`  + ${file}`);
    } else {
      console.log(`  ! 跳过（两个层级都不足 2 条标题）${file}`);
    }
  }
  console.log(`\n${changed} / ${targets.length} 个文件已加目录`);
}

main();
