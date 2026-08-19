#!/usr/bin/env node
/**
 * EdgeOne CLI Install Script
 *
 * Installs or upgrades EdgeOne CLI to the required minimum version.
 * Idempotent — if already installed and version is sufficient, exits immediately.
 * Auto-selects the fastest npm registry (official vs taobao mirror).
 *
 * Usage:
 *   node install-cli.mjs [--min-version <ver>]
 *
 * Exit codes:
 *   0 — CLI is ready (already installed or freshly installed)
 *   1 — installation failed
 *   2 — both registries unreachable (network issue)
 */
import { execSync, spawnSync } from 'node:child_process';

const DEFAULT_MIN_VERSION = '1.6.7';

// --- Argument parsing ---
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const minVersion = getArg('--min-version') || DEFAULT_MIN_VERSION;

// --- Helpers ---
function output(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
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

function getInstalledVersion() {
  try {
    const out = execSync('edgeone -v', { encoding: 'utf-8', timeout: 10_000 }).trim();
    return out.replace(/[^0-9.]/g, '');
  } catch {
    return null;
  }
}

async function pingRegistry(url) {
  const start = Date.now();
  try {
    execSync(`npm ping --registry ${url}`, { encoding: 'utf-8', timeout: 8_000, stdio: 'pipe' });
    return Date.now() - start;
  } catch {
    return Infinity;
  }
}

function installFrom(registry) {
  const result = spawnSync('npm', ['install', '-g', 'edgeone@latest', '--registry', registry], {
    encoding: 'utf-8',
    timeout: 120_000,
    stdio: 'pipe',
  });
  return result.status === 0;
}

// --- Step 1: Check if already installed and sufficient ---
const currentVersion = getInstalledVersion();
if (currentVersion && compareVersions(currentVersion, minVersion) >= 0) {
  output({ status: 'ready', version: currentVersion, installed: false, message: `CLI v${currentVersion} already meets minimum v${minVersion}` });
  process.exit(0);
}

// --- Step 2: Select fastest registry ---
const OFFICIAL = 'https://registry.npmjs.org';
const MIRROR = 'https://registry.npmmirror.com';

console.error(`[install-cli] Current: ${currentVersion || 'not installed'}, need >= ${minVersion}. Testing registries...`);

const [officialMs, mirrorMs] = await Promise.all([
  pingRegistry(OFFICIAL),
  pingRegistry(MIRROR),
]);

if (officialMs === Infinity && mirrorMs === Infinity) {
  output({ status: 'error', code: 2, error: 'Both npm registries unreachable. Check network connectivity.' });
  process.exit(2);
}

const primaryRegistry = officialMs <= mirrorMs ? OFFICIAL : MIRROR;
const fallbackRegistry = primaryRegistry === OFFICIAL ? MIRROR : OFFICIAL;

console.error(`[install-cli] Using ${primaryRegistry} (${primaryRegistry === OFFICIAL ? officialMs : mirrorMs}ms)`);

// --- Step 3: Install ---
let success = installFrom(primaryRegistry);

if (!success) {
  console.error(`[install-cli] Primary registry failed. Trying fallback: ${fallbackRegistry}`);
  success = installFrom(fallbackRegistry);
}

if (!success) {
  output({ status: 'error', code: 1, error: 'Installation failed from both registries.' });
  process.exit(1);
}

// --- Step 4: Verify ---
const newVersion = getInstalledVersion();
if (!newVersion || compareVersions(newVersion, minVersion) < 0) {
  output({ status: 'error', code: 1, error: `Installed version ${newVersion || 'unknown'} still below minimum ${minVersion}` });
  process.exit(1);
}

output({ status: 'ready', version: newVersion, installed: true, message: `CLI v${newVersion} installed successfully` });
process.exit(0);
