// Checks that npm's identity preloader reports the tested SDK tree before success or failure, without server dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readServerPin } from './helpers/server-source.js';

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
