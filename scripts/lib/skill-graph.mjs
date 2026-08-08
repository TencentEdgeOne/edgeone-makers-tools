import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const MD_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

/**
 * 非本地链接：任意 URL scheme（http:/https:/mailto:/tel:/data: ……）与纯锚点。
 * 用通用 scheme 匹配而不是逐个枚举，免得以后漏掉一种就误报。
 */
const NON_LOCAL_LINK = /^([a-z][a-z0-9+.-]*:|#)/i;

/** root 必须是存在的目录，否则 readdirSync 只会抛 ENOENT/ENOTDIR 裸栈。 */
function assertDirectory(root) {
  if (!existsSync(root)) {
    throw new Error(`skill-graph: root directory not found: ${root}`);
  }
  if (!statSync(root).isDirectory()) {
    throw new Error(`skill-graph: root is not a directory: ${root}`);
  }
}

/** 递归列出所有 .md，返回相对 root 的 posix 路径，已排序。 */
export function listMarkdownFiles(root) {
  assertDirectory(root);
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) out.push(relative(root, full).split('\\').join('/'));
    }
  }
  walk(root);
  // 逐目录排序 + 深度优先并不等于全局有序（目录 a/ 与文件 a-b.md 会乱序），
  // 所以统一在这里排一次，让上面那句“已排序”成立。
  return out.sort();
}

/** skills/ 的直接子目录名，已排序。 */
export function listSkillDirs(root) {
  assertDirectory(root);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * 逐行遍历 root 下所有 markdown，对每行调用 visit(file, line, lineNumber)。
 * file 是相对 root 的 posix 路径，lineNumber 从 1 开始。
 *
 * 单个文件读失败（权限等）不该让整轮扫描失效——记进 unreadable 后跳过，
 * 其余文件照常检查。返回读不到的文件清单。
 */
export function forEachMarkdownLine(root, visit) {
  const unreadable = [];
  for (const file of listMarkdownFiles(root)) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch (error) {
      unreadable.push({ file, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    text.split(/\r?\n/).forEach((line, index) => visit(file, line, index + 1));
  }
  return unreadable;
}

/**
 * 逐个取出一行里的本地链接目标，已剥掉 #anchor 与 ?query。
 *
 * 注意：不跟踪 ``` 围栏状态，所以代码块里的链接同样会被取出来。
 * 目前真实仓库里没有“围栏内的坏链接”，不算问题；若以后新增示范用的
 * 错误链接片段（例如讲解断链时贴个反例），这里会误报，届时再加围栏开关。
 */
export function* localLinkTargets(line) {
  for (const match of line.matchAll(MD_LINK)) {
    const raw = match[1];
    if (NON_LOCAL_LINK.test(raw)) continue;
    const target = raw.split('#')[0].split('?')[0];
    if (target) yield target;
  }
}

/**
 * 找出指向不存在文件的相对 markdown 链接。
 *
 * 关键：以链接所在文件的目录为基准解析（模型就是这样读的），
 * 而不是以仓库根目录为基准（作者往往这样心算）。
 *
 * 返回项形如 { file, line, target }；读不到的文件另记一条
 * { file, line: 0, target: null, error }，让上层能区分“链接坏了”和“文件没读到”，
 * 而不是把权限问题静默当成“没有断链”。
 */
export function findBrokenLinks(root) {
  const broken = [];
  const unreadable = forEachMarkdownLine(root, (file, line, lineNumber) => {
    for (const target of localLinkTargets(line)) {
      if (!target.endsWith('.md')) continue;
      const resolved = resolve(dirname(join(root, file)), target);
      if (!existsSync(resolved) || !statSync(resolved).isFile()) {
        broken.push({ file, line: lineNumber, target });
      }
    }
  });
  for (const entry of unreadable) {
    broken.push({ file: entry.file, line: 0, target: null, error: entry.error });
  }
  return broken;
}
