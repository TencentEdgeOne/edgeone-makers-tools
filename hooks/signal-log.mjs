import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REQUIRED_SIGNAL_FIELDS = ['hook', 'trigger', 'matchedSkill', 'reason'];

export function defaultSignalLogPath(env = process.env, cwd = process.cwd()) {
  return env.EDGEONE_MAKERS_SIGNAL_LOG || join(cwd, '.edgeone', 'signal-log.jsonl');
}

function normalizeSignalLogEntry(entry, now = new Date()) {
  for (const field of REQUIRED_SIGNAL_FIELDS) {
    if (!entry?.[field]) {
      throw new Error(`Missing signal log field: ${field}`);
    }
  }

  const normalized = {
    timestamp: now.toISOString(),
    hook: entry.hook,
    trigger: entry.trigger,
    matchedSkill: entry.matchedSkill,
    reason: entry.reason,
  };

  if (entry.platform) normalized.platform = entry.platform;
  if (entry.toolName) normalized.toolName = entry.toolName;

  return normalized;
}

export function shouldWriteSignalLog(options = {}) {
  return Boolean(options.enableSignalLog || options.signalLogPath);
}

export function writeSignalLog(entry, options = {}) {
  const normalized = normalizeSignalLogEntry(entry, options.now);
  const logPath = options.logPath || options.signalLogPath || defaultSignalLogPath();

  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(normalized)}\n`);

  return normalized;
}
