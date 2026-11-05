import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const skillRoot = new URL('../skills/edgeone-makers-tools/', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, skillRoot), 'utf8');
const capability = (name) => read(`references/${name}/SKILL.md`);

test('CLI documents workspace discovery, selection and credential isolation', () => {
  const cli = capability('makers-cli');
  for (const command of ['edgeone workspace ls', 'edgeone workspace use', 'edgeone whoami']) {
    assert.ok(cli.includes(command), `Missing command: ${command}`);
  }
  for (const field of ['Workspace Name', 'Workspace ID', 'Plan', 'Status', 'cached', 'linked (this directory)']) {
    assert.ok(cli.includes(field), `Missing workspace display: ${field}`);
  }
  assert.match(cli, /not.*under.*makers/i);
  assert.match(cli, /<region>:<ZoneId>/);
  assert.match(cli, /multiple workspaces[\s\S]*conversation/i);
  assert.match(cli, /same name[\s\S]*Workspace ID/i);
  assert.match(cli, /--help[\s\S]*first published version/i);
});

test('CLI separates directory links, explicit credentials and configuration', () => {
  const cli = capability('makers-cli');
  assert.match(cli, /project\.json[\s\S]*Name[\s\S]*ProjectId[\s\S]*ZoneId/);
  assert.match(cli, /does not change[\s\S]*project\.json[\s\S]*auth\.json/i);
  assert.match(cli, /different[\s\S]*-n|-n[\s\S]*different/i);
  assert.match(cli, /EDGEONE_PAGES_API_TOKEN[\s\S]*auth\.json[\s\S]*global credentials/);
  assert.match(cli, /Never[\s\S]*--zone-id[\s\S]*zone_id/i);
  assert.match(cli, /\.token[\s\S]*not[\s\S]*native/i);
});

test('deploy checks actual links and never equates login with a resolved target', () => {
  const deploy = capability('makers-deploy');
  assert.match(deploy, /cat \.edgeone\/project\.json/);
  assert.doesNotMatch(deploy, /cat edgeone\.json|linked \(edgeone\.json exists\)|first deploy creates `edgeone\.json`/i);
  assert.match(deploy, /workspace use[\s\S]*re-link/i);
  assert.match(deploy, /ProjectId[\s\S]*not visible[\s\S]*do not[\s\S]*creat/i);
  assert.match(deploy, /unknown[\s\S]*do not guess/i);
  assert.match(deploy, /query failure[\s\S]*not[\s\S]*project does not exist/i);
});

test('deploy command reference delegates workspace semantics and removes invented token priority', () => {
  const reference = read('references/makers-deploy/references/command-reference.md');
  assert.ok(reference.includes('../SKILL.md#deployment-flow'));
  assert.doesNotMatch(reference, /\]\(\.\.\/\.\.\//);
  assert.ok(capability('makers-deploy').includes('../makers-cli/SKILL.md'));
  assert.match(reference, /edgeone workspace ls/);
  assert.match(reference, /edgeone workspace use/);
  assert.match(reference, /auth\.json/);
  assert.doesNotMatch(reference, /3\. `\.edgeone\/\.token`/);
  assert.doesNotMatch(reference, /env add KEY/);
});

test('sandbox guidance distinguishes browser callbacks from workspace terminal selection', () => {
  const env = capability('makers-env-adaption');
  assert.match(env, /browser[\s\S]*does not[\s\S]*interactive terminal/i);
  assert.match(env, /auth\.json[\s\S]*single credential/i);
  assert.match(env, /workspace use[\s\S]*does not[\s\S]*auth\.json/i);
  assert.match(env, /target workspace[\s\S]*token/i);
  assert.match(env, /parse[\s\S]*ProjectId/i);
  assert.doesNotMatch(env, /cat \.edgeone\/project\.json[^\n]*&& echo/);
});

test('entry points route workspace questions to the canonical CLI capability', () => {
  assert.match(read('SKILL.md'), /workspace[\s\S]*references\/makers-cli\/SKILL\.md/i);
  for (const file of ['SKILL.md', 'AGENTS.md', 'CLAUDE.md']) {
    const entry = readFileSync(new URL(`../../${file}`, skillRoot), 'utf8');
    assert.match(entry, /workspace[\s\S]*skills\/edgeone-makers-tools\/references\/makers-cli\/SKILL\.md/i);
    assert.doesNotMatch(entry, /\| skills\/makers-/);
  }
});

test('agent, storage and scaffold workflows preserve linked targets and gateway ownership', () => {
  const agents = capability('makers-agents');
  assert.match(agents, /project\.json[^\n]*ZoneId/);
  assert.match(agents, /ai-gateway\.json[\s\S]*fingerprint/i);
  assert.match(agents, /hand-written[\s\S]*not[\s\S]*overwrit/i);
  assert.match(read('references/makers-agents/references/review-checklist.md'), /ProjectId[\s\S]*ZoneId/);
  for (const name of ['makers-storage', 'makers-recipes', 'makers-migration']) {
    const content = capability(name);
    assert.ok(content.includes('../makers-cli/SKILL.md'), `Missing shared workspace rule: ${name}`);
  }
  assert.doesNotMatch(capability('makers-storage'), /ALWAYS pass `-n/);
});

test('non-interactive defaults preserve an existing link rather than naming another target', () => {
  const deploy = capability('makers-deploy');
  const ci = deploy.split('### Non-interactive / Agent / CI deploy')[1].split('### Build behavior')[0];
  assert.match(ci, /edgeone makers deploy --json/);
  assert.doesNotMatch(ci, /^edgeone makers deploy[^\n]* -n /m);
  const env = capability('makers-env-adaption');
  assert.doesNotMatch(env, /# Correct: deploy\nedgeone makers deploy -n/);
  assert.doesNotMatch(env, /Only after the user confirms[^\n]*deploy -n/);
  assert.doesNotMatch(env, /Re-running `deploy` \(same `-n/);
  const reference = read('references/makers-deploy/references/command-reference.md');
  assert.doesNotMatch(reference, /\| `--name <project>` \/ `-n`[^\n]*Skip interactive/);
  for (const row of reference.split('\n').filter((line) => line.startsWith('|') && /deploy|dev/i.test(line))) {
    if (/new project/i.test(row)) continue;
    assert.doesNotMatch(row, /edgeone makers (?:deploy|dev)[^`]* (?:-n|--name) /, `Linked default changes target: ${row}`);
  }
  assert.doesNotMatch(env, /\| Start dev server \|[^\n]*--name/);
});

test('login and switching instructions explicitly use the agent interaction channel', () => {
  const files = [
    'references/makers-cli/SKILL.md',
    'references/makers-deploy/SKILL.md',
    'references/makers-deploy/references/command-reference.md',
    'references/makers-deploy/references/anonymous-deploy.md',
    'references/makers-env-adaption/SKILL.md',
    'references/makers-storage/SKILL.md',
  ];
  for (const file of files) {
    const content = read(file);
    for (const match of content.matchAll(/edgeone (?:login|switch|workspace use)\b([^\n`]*)/g)) {
      if (/--help/.test(match[1])) continue;
      assert.match(match[0], /--interaction agent/, `${file}: ${match[0]}`);
    }
  }
});

test('agent login documents pending selection, safe resume and cached switching', () => {
  const cli = capability('makers-cli');
  for (const value of ['selection_required', 'sessionId', 'waiting', 'already_logged_in', '10 minutes', 'same directory', 'single-use']) {
    assert.ok(cli.includes(value), `Missing agent protocol: ${value}`);
  }
  assert.match(cli, /edgeone login[^\n]*--session[^\n]*--workspace[^\n]*--interaction agent/);
  assert.match(cli, /edgeone workspace use[^\n]*--interaction agent/);
  assert.match(cli, /exit code 0[^\n]*not[^\n]*success/i);
  assert.match(cli, /workspaces[^\n]*id[^\n]*name[^\n]*plan[^\n]*available/);
  assert.match(cli, /No sessionId[^\n]*workspace use/i);
  for (const name of ['makers-deploy', 'makers-env-adaption']) {
    assert.ok(capability(name).includes('selection_required'), `${name} must handle pending login`);
    assert.ok(capability(name).includes('../makers-cli/SKILL.md'));
  }
  assert.doesNotMatch(cli, /With multiple workspaces, require an interactive terminal/);
  assert.doesNotMatch(capability('makers-env-adaption'), /no TTY is available, use the target workspace's API token/);
  assert.doesNotMatch(capability('makers-deploy'), /Browser does not open during login \| Switch to token login/);
  assert.doesNotMatch(capability('makers-deploy'), /browser login is unavailable[^\n]*Provide a token/);
});

test('cross-workspace relinking defines a sequential CLI-managed target change', () => {
  const cli = capability('makers-cli');
  const section = cli.split('### Re-link this directory to another workspace')[1]?.split('### Credential sources')[0];
  assert.ok(section, 'Missing canonical cross-workspace relinking workflow');
  assert.match(section, /not[\s\S]*migrat[\s\S]*cloud project/i);
  assert.match(section, /same name[\s\S]*different[\s\S]*ProjectId/i);
  const sequence = [
    'edgeone workspace use <workspaceBId> --interaction agent',
    'edgeone whoami',
    'edgeone makers link --name <projectInB>',
    'cat .edgeone/project.json',
    'edgeone makers deploy --json',
  ];
  let previous = -1;
  for (const command of sequence) {
    const position = section.indexOf(command);
    assert.ok(position > previous, `Missing or out-of-order relinking step: ${command}`);
    previous = position;
  }
  assert.match(section, /sequential[\s\S]*not[\s\S]*unconditional/i);
  assert.match(section, /ProjectId[\s\S]*ZoneId[\s\S]*match/i);
  assert.match(section, /Do not[\s\S]*move[\s\S]*delete[\s\S]*project\.json/i);
  assert.match(section, /older[\s\S]*stop[\s\S]*upgrade/i);
  assert.match(section, /create[\s\S]*\.env[\s\S]*consent/i);
  assert.match(section, /same-name[\s\S]*deploy -n[\s\S]*not[\s\S]*re-link/i);
  assert.match(section, /failure[\s\S]*not[\s\S]*deploy/i);
  assert.match(cli, /project's `\.env`[\s\S]*EDGEONE_PAGES_API_TOKEN/i);
});

test('cross-workspace relinking is discoverable through deploy and sandbox entry points', () => {
  const deploy = capability('makers-deploy');
  assert.ok(deploy.includes('../makers-cli/SKILL.md#re-link-this-directory-to-another-workspace'));
  assert.match(deploy, /same-name[\s\S]*deploy -n[\s\S]*not[\s\S]*re-link/i);
  const env = capability('makers-env-adaption');
  assert.ok(env.includes('../makers-cli/SKILL.md#re-link-this-directory-to-another-workspace'));
  assert.doesNotMatch(env, /# Unlinked only: confirmed target/);
  const reference = read('references/makers-deploy/references/command-reference.md');
  assert.ok(reference.includes('../SKILL.md#deployment-flow'));
  assert.match(reference, /re-link[\s\S]*edgeone makers link --name <projectInB>/i);
  assert.match(reference, /does not migrat[\s\S]*cloud project/i);
});

test('legacy CLI can keep ordinary login and its existing target without forced upgrade', () => {
  const cli = capability('makers-cli');
  assert.match(cli, /### Legacy CLI compatibility/);
  assert.match(cli, /ordinary login[^\n]*do not[^\n]*upgrade/i);
  assert.match(cli, /existing credential[^\n]*not[^\n]*first/i);
  assert.match(cli, /rejects[^\n]*omit[^\n]*--interaction/i);
  assert.match(cli, /workspace switching[^\n]*upgrade/i);
  assert.match(cli, /multiple-workspace[^\n]*terminal[^\n]*stop/i);
  assert.match(cli, /legacy[^\n]*success message[^\n]*whoami/i);
  assert.doesNotMatch(cli, /Upgrade to a build supporting this protocol or stop/);
  assert.match(capability('makers-deploy'), /legacy[^\n]*compatibility/i);
  assert.match(capability('makers-env-adaption'), /legacy[^\n]*compatibility/i);
});
