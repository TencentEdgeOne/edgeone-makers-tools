#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export const MINIMAL_SESSION_START_CONTEXT = [
  'EdgeOne Makers Tools is installed.',
  'Use CLAUDE.md / AGENTS.md as the Skill route table.',
  'Load exactly the matching makers-* Skill before EdgeOne Makers work.',
  'Do not load all Skills at startup.',
  'Prefer Makers-specific Skills over generic EdgeOne Pages guidance.',
].join('\n');

export function buildSessionStartOutput() {
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: MINIMAL_SESSION_START_CONTEXT,
    },
  };
}

export async function main() {
  process.stdout.write(`${JSON.stringify(buildSessionStartOutput(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

