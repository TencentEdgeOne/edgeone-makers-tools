import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, `skills/edgeone-makers-tools/references/${name}/SKILL.md`), 'utf8');

test('all CLI execution guidance shares the 1.7.0 floor without retrying an unreleased package', () => {
  const docs = [read('makers-cli'), read('makers-deploy'), read('makers-env-adaption'), ...['anonymous-deploy.md', 'command-reference.md'].map((file) => readFileSync(path.join(root, 'skills/edgeone-makers-tools/references/makers-deploy/references', file), 'utf8'))];
  for (const text of docs) {
    assert.match(text, /1\.7\.0/);
    assert.doesNotMatch(text, /1\.6\.0|1\.6\.7|1\.6\.29|1\.6\.28/);
    assert.doesNotMatch(text, /Legacy text mode remains supported|legacy text otherwise|legacy CLI requires/);
    assert.doesNotMatch(text, /edgeone login --site <china\\?\|global> --local/);
    assert.doesNotMatch(text, /Retry\. Polling runs|If it exits non-zero.*re-run the same command/);
  }
  assert.match(docs[0], /not yet available/);
  assert.match(docs[0], /do not repeatedly install/);
  assert.match(docs[0], /Writing code.*does not require/s);
});

test('standalone skill has a complete native agent flow without requiring a team or MCP', () => {
  const cli = read('makers-cli');
  assert.match(cli, /Standalone Skill/);
  assert.match(cli, /MCP is optional/);
  assert.match(cli, /edgeone login --interaction agent/);
  assert.match(cli, /edgeone login --interaction agent --session <sessionId> --workspace <workspaceId>/);
  assert.match(cli, /edgeone workspace use <workspaceId> --interaction agent/);
  assert.match(cli, /edgeone workspace use <workspaceId> --interaction agent --session <sessionId>/);
  assert.match(cli, /edgeone switch --interaction agent/);
  assert.match(cli, /already_logged_in.*does not confirm.*switch/);
  assert.doesNotMatch(cli, /edgeone login --interaction auto/);
  assert.doesNotMatch(cli, /TeamCreate|主理人|team-lead/);
});

test('identity, credential precedence and failed one-use resumes are handled explicitly', () => {
  const cli = read('makers-cli');
  assert.match(cli, /authenticated: null/);
  assert.match(cli, /workspace_confirmation_required/);
  assert.match(cli, /approval.*re-run/s);
  assert.match(cli, /do not replay.*consumed/s);
  assert.match(cli, /global selection.*local credential/s);
  assert.match(cli, /Do not delete.*auth.json/s);
  assert.match(cli, /Do not read.*credential caches/s);
});

test('deploy uses the shared flow and never treats config, failed queries or caches as authorization', () => {
  const deploy = read('makers-deploy');
  assert.match(deploy, /\.\.\/makers-cli\/SKILL.md/);
  assert.match(deploy, /\.edgeone\/project\.json/);
  assert.match(deploy, /PROJECT_ALREADY_EXISTS/);
  assert.match(deploy, /PROJECT_LOOKUP_FAILED/);
  assert.doesNotMatch(deploy, /cat edgeone.json|cat \.edgeone\/\.token|echo "<token>"|value\.Token/);
  assert.doesNotMatch(deploy, /ALWAYS pass `--site`|NEVER run a bare|exit 1 → not logged in/);
  assert.doesNotMatch(deploy, /skip login checks entirely|Always pass `-n` to dev/);
  assert.match(deploy, /1\.7\.0/);
});

test('the deployment command reference cannot reintroduce credential-cache or action confusion', () => {
  const text = readFileSync(path.join(root, 'skills/edgeone-makers-tools/references/makers-deploy/references/command-reference.md'), 'utf8');
  assert.match(text, /\.\.\/SKILL.md#login/);
  assert.match(text, /edgeone workspace use <workspaceId> --interaction agent/);
  assert.doesNotMatch(text, /\.edgeone\/\.token|Delete .*token|agent reads .*token/);
});

test('standalone generated guides keep current login rules and resolvable references', () => {
  for (const name of ['makers-cli', 'makers-deploy', 'makers-env-adaption']) {
    for (const relative of [`codex/${name}.md`, `cursor/rules/${name}.mdc`]) {
      const file = path.join(root, relative);
      const text = readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /cat \.edgeone\/\.token|value\.Token|ALWAYS pass `--site`/);
      const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1].split('#')[0]);
      for (const link of links.filter((link) => link && !/^[a-z]+:\/\//i.test(link) && !/^<[^>]+>$/.test(link))) {
        assert.ok(existsSync(path.resolve(path.dirname(file), link)), `${relative}: unresolved ${link}`);
      }
    }
  }
});

test('environment guidance shares the flow without forcing local login or cloud access for static previews', () => {
  const env = read('makers-env-adaption');
  assert.match(env, /\.\.\/makers-cli\/SKILL.md/);
  assert.match(env, /pure-static.*without login/s);
  assert.doesNotMatch(env, /Recommended approach.*--local|bypassing home-directory write restrictions|exit 1 = not logged in/);
  assert.doesNotMatch(env, /whoami` returns exit 1, run|auto-creates the project|implicitly link via the dev|not linking will always cause/);
  assert.match(env, /Cloud-backed.*verified directory association/s);
  const reference = readFileSync(path.join(root, 'skills/edgeone-makers-tools/references/makers-deploy/references/command-reference.md'), 'utf8');
  assert.doesNotMatch(reference, /\]\(\.\.\/\.\.\/makers-cli/);
});
