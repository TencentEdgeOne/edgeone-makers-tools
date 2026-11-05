import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'skills/edgeone-makers-tools/references');
const capabilities = readdirSync(source).filter((name) => existsSync(path.join(source, name, 'SKILL.md'))).sort();
const outputs = ['codex', 'cursor/rules'];

const codePattern = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$|(`+)[^\n]*?\2/gm;

function localTargets(content) {
  const prose = content.replace(codePattern, '');
  return [...prose.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(?:[a-z][a-z\d+.-]*:|\/|#|<)/i.test(target));
}

test('build keeps local reference targets intact after relocating capability files', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  for (const directory of outputs) {
    for (const name of capabilities) {
      const sourceFile = path.join(source, name, 'SKILL.md');
      const outputFile = path.join(root, directory, `${name}.${directory === 'codex' ? 'md' : 'mdc'}`);
      const sourceContent = readFileSync(sourceFile, 'utf8');
      const outputContent = readFileSync(outputFile, 'utf8');
      assert.deepEqual(outputContent.match(codePattern), sourceContent.match(codePattern), `Changed code example: ${outputFile}`);
      const sourceTargets = localTargets(sourceContent);
      const outputTargets = localTargets(outputContent);
      assert.deepEqual(outputContent.match(/\[[^\]\n]*\]\((?:[a-z][a-z\d+.-]*:|#|<)[^\s)]+\)/gi),
        sourceContent.match(/\[[^\]\n]*\]\((?:[a-z][a-z\d+.-]*:|#|<)[^\s)]+\)/gi), `Changed URL/anchor/placeholder: ${outputFile}`);
      assert.equal(outputTargets.length, sourceTargets.length, outputFile);
      for (let index = 0; index < sourceTargets.length; index += 1) {
        const expected = path.resolve(path.dirname(sourceFile), sourceTargets[index].split('#')[0]);
        const actual = path.resolve(path.dirname(outputFile), outputTargets[index].split('#')[0]);
        assert.equal(actual, expected, `${outputFile}: ${outputTargets[index]}`);
        assert.ok(existsSync(actual), `Missing generated reference target: ${actual}`);
        assert.equal(outputTargets[index].split('#').slice(1).join('#'), sourceTargets[index].split('#').slice(1).join('#'));
      }
    }
  }
});
