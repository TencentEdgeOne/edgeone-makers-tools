#!/usr/bin/env node
/**
 * Skills 自检入口。六项检查：
 *   断链 / 悬空 skill 名 / 二级引用 / reference 目录 / 行数上限 / 发布清单一致性
 * 退出码 0 = 全绿，1 = 有失败项。
 *
 * 分层：skill-graph.mjs 只认「给一个 root，返回纯数据」，不知道仓库根在哪；
 * 认识 _meta.json 与 skills/ 位置的是这一层。
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  checkFileManifest,
  findBrokenLinks,
  findDanglingSkillNames,
  findDeepReferenceLinks,
  findMissingTocs,
  findOversizedFiles,
} from './lib/skill-graph.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  { key: 'brokenLinks', check: 'broken-links', label: '断链' },
  { key: 'danglingNames', check: 'dangling-skill-names', label: '悬空 skill 名' },
  { key: 'deepLinks', check: 'deep-reference-links', label: '二级引用' },
  { key: 'missingTocs', check: 'missing-toc', label: '缺目录的长 reference' },
  { key: 'oversized', check: 'oversized-file', label: '超行数上限' },
];

export function collect(skillsDir, metaPath = join(REPO_ROOT, '_meta.json')) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  return {
    brokenLinks: findBrokenLinks(skillsDir),
    danglingNames: findDanglingSkillNames(skillsDir),
    deepLinks: findDeepReferenceLinks(skillsDir),
    missingTocs: findMissingTocs(skillsDir),
    oversized: findOversizedFiles(skillsDir),
    manifest: checkFileManifest(skillsDir, meta.files),
  };
}

export function summarize(results) {
  const failures = [];
  for (const { key, check, label } of CHECKS) {
    const items = results[key] || [];
    if (items.length > 0) failures.push({ check, label, count: items.length, items });
  }
  const manifest = results.manifest || { missing: [], extra: [] };
  if (manifest.missing.length > 0 || manifest.extra.length > 0) {
    failures.push({
      check: 'manifest-parity',
      label: '_meta.json 与磁盘不一致',
      count: 1,
      items: [manifest],
    });
  }
  return { ok: failures.length === 0, failures };
}

function describeItem(item) {
  // 读不到的文件是 findBrokenLinks 混在 broken 数组里的另一种条目
  // （{ file, line: 0, target: null, error }），跟「链接坏了」不是一回事，必须先单独认出来：
  // 它的 line 是 0，会让下面 `if (item.line)` 落空，最该说清楚的那条反而退化成一坨裸 JSON。
  if (typeof item.error === 'string') return `无法读取 ${item.file}：${item.error}`;
  if (Array.isArray(item.missing)) {
    const parts = [];
    if (item.missing.length) parts.push(`未声明 ${item.missing.length} 个：${item.missing.join(', ')}`);
    if (item.extra.length) parts.push(`多声明 ${item.extra.length} 个：${item.extra.join(', ')}`);
    return parts.join('；');
  }
  if (item.line) return `${item.file}:${item.line} → ${item.target || item.name}`;
  if (item.lines) return `${item.file}（${item.lines} 行）`;
  return JSON.stringify(item);
}

export function formatReport(summary) {
  if (summary.ok) return '✅ doctor：六项检查全部通过';
  const lines = ['❌ doctor：发现问题'];
  for (const failure of summary.failures) {
    lines.push(`\n[${failure.check}] ${failure.label} — ${failure.count} 处`);
    for (const item of failure.items) lines.push(`  - ${describeItem(item)}`);
  }
  return lines.join('\n');
}

export function main(skillsDir = join(REPO_ROOT, 'skills')) {
  const summary = summarize(collect(skillsDir));
  console.log(formatReport(summary));
  return summary.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
