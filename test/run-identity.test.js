// Checks npm's identity preloader, Node floor and missing-Git startup diagnostics without server dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readServerPin } from './helpers/server-source.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('package and lockfile require Node 18.18 or newer for identity preloading', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.engines.node, '>=18.18.0');
  assert.equal(lock.packages[''].engines.node, packageJson.engines.node);
});

test('every suite clearly diagnoses missing Git before executing tests', async t => {
  const pathWithoutGit = mkdtempSync(join(tmpdir(), 'skyzai-no-git-'));
  t.after(() => rmSync(pathWithoutGit, { recursive: true, force: true }));
  const env = { ...process.env, PATH: pathWithoutGit };
  // The subprocess is a new test runner, not a child test file of this runner.
  delete env.NODE_TEST_CONTEXT;
  for (const name of ['test', 'test:e2e', 'test:server-requirements']) {
    await t.test(name, () => {
      const [command, ...args] = packageJson.scripts[name].split(' ');
      assert.equal(command, 'node');
      const result = spawnSync(process.execPath, args, {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env, encoding: 'utf8', timeout: 10_000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const output = result.stdout + result.stderr;
      assert.match(output, /Git is required to run Skyzai SDK tests; install Git and ensure git is on PATH/);
      assert.ok(output.includes(`[skyzai test run] sdk_sha=unavailable sdk_dirty=unavailable server_sha=${readServerPin()}`), output);
      assert.doesNotMatch(output, /skyzai test source/);
    });
  }
});

test('run identity precedes success and failure, independently of the invoking directory', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const identity = `[skyzai test run] sdk_sha=${git(['rev-parse', 'HEAD'])} sdk_dirty=${git(['status', '--porcelain']).length > 0} server_sha=${readServerPin()}`;
  for (const fails of [false, true]) {
    const result = spawnSync(process.execPath, [
      '--import', new URL('./helpers/run-identity.js', import.meta.url).href,
      '--eval', fails ? "throw new Error('deliberate identity fixture failure')" : '',
    ], { cwd: tmpdir(), encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, fails ? 1 : 0, result.stderr);
    assert.equal(result.stdout.trim(), identity);
    if (fails) assert.match(result.stderr, /deliberate identity fixture failure/);
  }
});
