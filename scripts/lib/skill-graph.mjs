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

/**
 * skill 名 token。
 *
 * 只认 `edgeone-` 前缀是刻意保守：仓库里裸的 `makers-*` 大量撞车
 * （`makers-conversation-id` 是个 HTTP 头，还有 `makers-ai-voice-chat` 这类项目名），
 * 放宽会把误报刷成噪音。
 *
 * 代价是有盲区：`makers-cli` / `makers-cloud-functions` / `makers-migration`
 * 这三个 skill 的 frontmatter 声明的就是裸名，正文里引用它们时本函数看不见。
 * 所以返回的条数是**下界**，别当成全覆盖。
 */
const SKILL_NAME_TOKEN = /\bedgeone-(?:makers|pages)-[a-z0-9-]+/g;

/** marketplace / plugin 的产品 slug，不是 skill 名，不参与悬空判定。 */
const NON_SKILL_SLUGS = new Set(['edgeone-makers-tools']);

/**
 * 各 SKILL.md frontmatter 声明的 name 集合。
 *
 * 读不到就跳过而不是抛：这函数是 doctor 六项检查之一的输入，
 * 一个权限异常的文件不该把整份报告换成裸栈。漏读的文件由
 * findBrokenLinks 那条 unreadable 记录负责报出来。
 */
export function listDeclaredSkillNames(root) {
  const names = new Set();
  for (const dir of listSkillDirs(root)) {
    const skillPath = join(root, dir, 'SKILL.md');
    if (!existsSync(skillPath) || !statSync(skillPath).isFile()) continue;
    let text;
    try {
      text = readFileSync(skillPath, 'utf8');
    } catch {
      continue;
    }
    const match = /^name:\s*(.+)$/m.exec(text);
    if (match) names.add(match[1].trim().replace(/^["']|["']$/g, ''));
  }
  return names;
}

/**
 * 找出正文/description 里出现、但没有任何 skill 声明的 skill 名。
 * 模型会尝试加载这种名字，失败后重试成环。
 *
 * 读不到的文件不在这里单独记账：findBrokenLinks 走的是同一批文件，
 * 已经会把它们报出来，doctor 那层不需要同一个问题听三遍。
 */
export function findDanglingSkillNames(root) {
  const declared = listDeclaredSkillNames(root);
  const dangling = [];
  forEachMarkdownLine(root, (file, line, lineNumber) => {
    for (const match of line.matchAll(SKILL_NAME_TOKEN)) {
      const name = match[0];
      if (declared.has(name) || NON_SKILL_SLUGS.has(name)) continue;
      dangling.push({ file, line: lineNumber, name });
    }
  });
  return dangling;
}

/**
 * 爬升两级以上的相对路径。
 * `(^|\/)` 这道前置守卫是为了别把 `..../../` 这类含 `....` 目录名的路径误判成两级爬升。
 */
const DEEP_PARENT_LINK = /(^|\/)\.\.\/\.\.\//;

/**
 * 找出爬升两级以上的相对链接。
 * Anthropic 要求 reference 只下沉一层；`../../` 让模型在目录间反复横跳。
 *
 * 复用 localLinkTargets：它剥的是 #anchor / ?query，不动 `../` 前缀，
 * 所以判定与上报的 target 都保留原样的爬升层数，且与 findBrokenLinks
 * 的 target 归一化方式一致。
 */
export function findDeepReferenceLinks(root) {
  const deep = [];
  forEachMarkdownLine(root, (file, line, lineNumber) => {
    for (const target of localLinkTargets(line)) {
      if (DEEP_PARENT_LINK.test(target)) deep.push({ file, line: lineNumber, target });
    }
  });
  return deep;
}
