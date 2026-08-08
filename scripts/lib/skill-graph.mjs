import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const MD_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** 递归列出所有 .md，返回相对 root 的 posix 路径，已排序。 */
export function listMarkdownFiles(root) {
  const out = [];
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) out.push(relative(root, full).split('\\').join('/'));
    }
  }
  walk(root);
  return out;
}

/** skills/ 的直接子目录名，已排序。 */
export function listSkillDirs(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * 找出指向不存在文件的相对 markdown 链接。
 *
 * 关键：以链接所在文件的目录为基准解析（模型就是这样读的），
 * 而不是以仓库根目录为基准（作者往往这样心算）。
 * 跳过 http(s)/mailto/纯锚点；#anchor 与 ?query 在解析前剥离。
 */
export function findBrokenLinks(root) {
  const broken = [];
  for (const file of listMarkdownFiles(root)) {
    const abs = join(root, file);
    readFileSync(abs, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        for (const match of line.matchAll(MD_LINK)) {
          const raw = match[1];
          if (/^(https?:|mailto:|#)/.test(raw)) continue;
          const target = raw.split('#')[0].split('?')[0];
          if (!target || !target.endsWith('.md')) continue;
          const resolved = resolve(dirname(abs), target);
          if (!existsSync(resolved) || !statSync(resolved).isFile()) {
            broken.push({ file, line: index + 1, target });
          }
        }
      });
  }
  return broken;
}
