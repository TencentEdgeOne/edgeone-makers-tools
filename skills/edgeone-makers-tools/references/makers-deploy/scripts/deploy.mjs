#!/usr/bin/env node
/**
 * EdgeOne Makers Deploy Script
 *
 * Streamlined deployment: CLI check → auth check → deploy → structured output.
 * Designed for AI Agent invocation — outputs JSON, handles errors gracefully.
 *
 * Usage:
 *   node deploy.mjs [--name <project>] [--preview] [--token <t>]
 *
 * Exit codes:
 *   0 — deploy succeeded
 *   1 — deploy failed (see JSON output for error)
 *   2 — CLI not installed / version too low
 *   3 — not authenticated (needs login or token)
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIN_CLI_VERSION = '1.6.0';

// --- Argument parsing ---
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
function hasFlag(flag) {
  return args.includes(flag);
}

const projectName = getArg('--name') || getArg('-n');
const preview = hasFlag('--preview') || hasFlag('-e');
const token = getArg('--token') || getArg('-t');

// --- Helpers ---
function output(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 180_000, env: { ...process.env, PAGES_SOURCE: 'skills' }, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

// --- Step 1: Check CLI ---
const versionOutput = run('edgeone -v');
if (!versionOutput) {
  output({ status: 'error', code: 2, error: 'EdgeOne CLI not installed. Run: npm install -g edgeone@latest' });
  process.exit(2);
}

const version = versionOutput.replace(/[^0-9.]/g, '');
if (compareVersions(version, MIN_CLI_VERSION) < 0) {
  output({ status: 'error', code: 2, error: `CLI version ${version} is below minimum ${MIN_CLI_VERSION}. Run: npm install -g edgeone@latest` });
  process.exit(2);
}

// --- Step 2: Check auth ---
if (!token) {
  const whoami = spawnSync('edgeone', ['whoami'], {
    encoding: 'utf-8',
    timeout: 10_000,
    env: { ...process.env, PAGES_SOURCE: 'skills' },
  });
  if (whoami.status !== 0) {
    // Check for saved token
    const tokenPath = resolve('.edgeone/.token');
    if (existsSync(tokenPath)) {
      // Will use saved token via env
      process.env.EDGEONE_PAGES_API_TOKEN = readFileSync(tokenPath, 'utf-8').trim();
    } else {
      output({
        status: 'error',
        code: 3,
        error: 'Not authenticated. Provide --token <t> or run: edgeone login --site <china|global>',
      });
      process.exit(3);
    }
  }
}

// --- Step 3: Build deploy command ---
const cmd = ['edgeone', 'makers', 'deploy', '--json'];
if (projectName) cmd.push('-n', projectName);
if (preview) cmd.push('-e', 'preview');
if (token) cmd.push('-t', token);

// --- Step 4: Execute deploy ---
const result = spawnSync(cmd[0], cmd.slice(1), {
  encoding: 'utf-8',
  timeout: 300_000, // 5 min max
  env: { ...process.env, PAGES_SOURCE: 'skills' },
  stdio: ['inherit', 'pipe', 'pipe'],
});

if (result.status !== 0) {
  // Try to parse --json error output
  const lines = (result.stdout || '').trim().split('\n');
  const lastLine = lines[lines.length - 1];
  try {
    const parsed = JSON.parse(lastLine);
    output({ status: 'error', code: 1, error: parsed.error || 'Deploy failed', raw: lastLine });
  } catch {
    output({ status: 'error', code: 1, error: result.stderr || result.stdout || 'Deploy failed (unknown error)' });
  }
  process.exit(1);
}

// --- Step 5: Parse success output ---
const lines = result.stdout.trim().split('\n');
const lastLine = lines[lines.length - 1];

try {
  const parsed = JSON.parse(lastLine);
  output({
    status: 'success',
    url: parsed.url,
    projectId: parsed.projectId,
    consoleUrl: parsed.consoleUrl,
    deploymentId: parsed.deploymentId,
  });
} catch {
  // Fallback: parse text output
  const urlMatch = result.stdout.match(/EDGEONE_DEPLOY_URL=(.+)/);
  const idMatch = result.stdout.match(/EDGEONE_PROJECT_ID=(.+)/);
  const consoleMatch = result.stdout.match(/https:\/\/console\.[^\s]+\/deployment\/[^\s]+/);

  output({
    status: 'success',
    url: urlMatch ? urlMatch[1].trim() : null,
    projectId: idMatch ? idMatch[1].trim() : null,
    consoleUrl: consoleMatch ? consoleMatch[0] : null,
  });
}

process.exit(0);
