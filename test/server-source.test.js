// Checks the handler fixture's source-pin admission without server dependencies or network access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readServerPin, prepareServerSource } from './helpers/server-source.js';

function fixture(t, content) {
  const directory = mkdtempSync(join(tmpdir(), 'skyzai-pin-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pinFile = join(directory, 'server-pin.json');
  if (content !== undefined) writeFileSync(pinFile, content);
  return { pinFile, cacheRoot: join(directory, 'cache') };
}

test('a missing server pin names the required config', t => {
  const { pinFile } = fixture(t);
  assert.throws(() => readServerPin(pinFile), /Missing server pin.*server-pin\.json/);
});

test('invalid JSON has a clear server-pin diagnostic', t => {
  const { pinFile } = fixture(t, '{');
  assert.throws(() => readServerPin(pinFile), /Invalid server pin.*server-pin\.json/);
});

test('server pin requires a full commit SHA, never a branch or abbreviated revision', t => {
  const { pinFile } = fixture(t);
  for (const sha of [undefined, null, '', 'development', '06ced337', 'x'.repeat(40)]) {
    writeFileSync(pinFile, JSON.stringify({ sha }));
    assert.throws(() => readServerPin(pinFile), /Server pin.*40-character.*SHA/);
  }
  const sha = '06ced3371528a871849156a70a114e457215b1be';
  writeFileSync(pinFile, JSON.stringify({ sha }));
  assert.equal(readServerPin(pinFile), sha);
});

test('a pin absent from the local Git object store fails before loading handlers', t => {
  const options = fixture(t, JSON.stringify({ sha: '0'.repeat(40) }));
  const repository = fileURLToPath(new URL('..', import.meta.url));
  assert.throws(() => prepareServerSource({ ...options, repository }), /Server pin 0{40} is not available/);
});
