import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function plainScalar(header, key) {
  const lines = header.split(/\r?\n/);
  const index = lines.findIndex(line => line.startsWith(`${key}:`));
  if (index < 0) throw new Error(`Missing frontmatter ${key}`);
  let value = lines[index].slice(key.length + 1).trim();
  if (/^[>|][-+]?$/.test(value)) {
    const content = [];
    for (let i = index + 1; i < lines.length && (!lines[i].trim() || /^\s/.test(lines[i])); i++) {
      content.push(lines[i].trim());
    }
    value = content.join(' ').replace(/\s+/g, ' ').trim();
  } else if (value.startsWith('"')) {
    value = JSON.parse(value);
  } else if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error(`Invalid frontmatter ${key}`);
    value = value.slice(1, -1).replace(/''/g, "'");
  }
  if (typeof value !== 'string' || !value || /^[!&*[{]/.test(value)) {
    throw new Error(`Invalid frontmatter ${key}`);
  }
  return value;
}

export function normalizeFrontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return text;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) throw new Error('Unclosed frontmatter');
  const name = plainScalar(match[1], 'name');
  const description = plainScalar(match[1], 'description');
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid skill name: ${name}`);
  return `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---${match[2]}${text.slice(match[0].length)}`;
}

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${relative}`);
    if (entry.isDirectory()) return walk(path.join(dir, entry.name), relative);
    if (!entry.isFile()) throw new Error(`Unsupported file: ${relative}`);
    return [relative];
  });
}

export function buildClaudePackage({ root = repoRoot, output } = {}) {
  if (!output) throw new Error('A temporary output directory is required');
  root = path.resolve(root);
  output = path.resolve(output);
  const source = path.join(root, 'skills/edgeone-makers-tools');
  const relativeOutput = path.relative(root, output);
  if (!relativeOutput || (!relativeOutput.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeOutput))) {
    throw new Error('Staging output must be outside the source tree');
  }
  const markdown = walk(source).filter(file => path.basename(file) !== '.DS_Store');
  if (markdown.some(file => !file.endsWith('.md'))) throw new Error('Canonical skill tree must contain only Markdown');
  const content = markdown.map(file => {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path.join(source, file)));
    if (text.includes('\0') || text.startsWith('#!') || /hooks\/hooks\.json|validate-write\.mjs|signal-log\.mjs|UserPromptSubmit|PreToolUse/.test(text)) {
      throw new Error(`Unsupported content or hook reference: ${file}`);
    }
    const normalized = normalizeFrontmatter(text);
    if (Buffer.byteLength(normalized) >= 256 * 1024) throw new Error(`Oversized Markdown: ${file}`);
    return [file, normalized];
  });
  const expected = new Set(['.claude-plugin/plugin.json', '.claude-plugin/icon.png', 'LICENSE', ...markdown.map(file => `skills/edgeone-makers-tools/${file}`)]);
  if (existsSync(output)) {
    for (const file of walk(output)) {
      if (!expected.has(file)) throw new Error(`Unexpected published file: ${file}`);
    }
  }
  const manifest = JSON.parse(readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  const publishedManifest = {
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    icon: './.claude-plugin/icon.png',
  };
  const icon = path.join(root, '.claude-plugin/icon.png');
  const png = readFileSync(icon);
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.length >= 2 * 1024 * 1024) throw new Error('Invalid PNG icon');
  const width = png.readUInt32BE(16);
  if (width !== png.readUInt32BE(20) || width < 512 || width > 2048) throw new Error('Icon must be square, 512–2048 pixels');
  mkdirSync(path.join(output, '.claude-plugin'), { recursive: true });
  writeFileSync(path.join(output, '.claude-plugin/plugin.json'), `${JSON.stringify(publishedManifest, null, 2)}\n`);
  copyFileSync(icon, path.join(output, '.claude-plugin/icon.png'));
  copyFileSync(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'));
  for (const [file, text] of content) {
    const destination = path.join(output, 'skills/edgeone-makers-tools', file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, text);
  }
  return { output, markdownCount: markdown.length };
}

export function packClaudePlugin({ root = repoRoot, output = path.resolve(root, '../edgeone-makers-tools-claude.zip') } = {}) {
  root = path.resolve(root);
  output = path.resolve(output);
  const relativeOutput = path.relative(root, output);
  const outsideRoot = relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput);
  if (!output.endsWith('.zip') || !outsideRoot) {
    throw new Error('Archive output must be a .zip outside the source tree');
  }
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'makers-claude-package-'));
  const stagingDirectory = path.join(temporary, 'plugin');
  let pendingArchive;
  try {
    const result = buildClaudePackage({ root, output: stagingDirectory });
    mkdirSync(path.dirname(output), { recursive: true });
    pendingArchive = mkdtempSync(path.join(path.dirname(output), '.makers-archive-'));
    const archive = path.join(pendingArchive, 'plugin.zip');
    try {
      execFileSync('zip', ['-q', '-r', '-X', archive, '.'], { cwd: stagingDirectory, stdio: 'pipe' });
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('The zip command is required. Install zip and run package:claude again.');
      throw error;
    }
    renameSync(archive, output);
    return { output, markdownCount: result.markdownCount, stagingDirectory };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    if (pendingArchive) rmSync(pendingArchive, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = packClaudePlugin();
  console.log(`Claude ZIP: ${result.markdownCount} Markdown files → ${result.output}`);
}
