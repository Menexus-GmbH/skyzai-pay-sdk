// Checks source-pin and locked dependency admission with disposable files/Git objects, without installs or network access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readServerPin, prepareServerSource, verifyServerDependencies } from './helpers/server-source.js';

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

const versions = { typescript: '5.9.3', jsonwebtoken: '9.0.3' };

function dependencyFixture(t) {
  const options = fixture(t);
  const { pinFile } = options;
  const root = join(dirname(pinFile), 'archived-functions');
  const dependenciesRoot = join(dirname(pinFile), 'donor-functions');
  mkdirSync(root);
  const packages = Object.fromEntries(Object.entries(versions).map(([name, version]) => [`node_modules/${name}`, { version }]));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  for (const [name, version] of Object.entries(versions)) {
    const directory = join(dependenciesRoot, 'node_modules', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version }));
  }
  return { ...options, root, dependenciesRoot };
}

function gitFixture(t) {
  const { root, dependenciesRoot, pinFile, cacheRoot } = dependencyFixture(t);
  const repository = dirname(pinFile);
  const functions = join(repository, 'functions');
  renameSync(root, functions);
  renameSync(join(dependenciesRoot, 'node_modules'), join(functions, 'node_modules'));
  mkdirSync(join(functions, 'src'));
  writeFileSync(join(functions, 'src/marker.js'), 'pinned source\n');
  const git = (args, input) => execFileSync('git', ['-C', repository, ...args], {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  }).trim();
  git(['init', '--quiet']);
  git(['add', 'functions/package-lock.json', 'functions/src/marker.js']);
  // Create objects only in this disposable repository; no real checkout or branch is written.
  const sha = git(['commit-tree', git(['write-tree'])], 'pinned fixture\n');
  writeFileSync(pinFile, JSON.stringify({ sha }));
  return { repository, pinFile, cacheRoot, git, sha };
}

test('a pinned commit must contain a Functions source directory before archive allocation', async t => {
  for (const layout of ['no functions', 'no src', 'src is a file']) {
    await t.test(layout, t => {
      const options = gitFixture(t);
      const { git, repository } = options;
      git(['rm', '-r', '--cached', layout === 'no functions' ? 'functions' : 'functions/src']);
      if (layout === 'src is a file') {
        rmSync(join(repository, 'functions/src'), { recursive: true });
        writeFileSync(join(repository, 'functions/src'), 'not a directory\n');
        git(['add', 'functions/src']);
      }
      const sha = git(['commit-tree', git(['write-tree'])], 'incomplete Functions layout\n');
      writeFileSync(options.pinFile, JSON.stringify({ sha }));
      assert.throws(() => prepareServerSource(options), new RegExp(`Pinned server commit ${sha} must contain the functions/src directory`));
      assert.equal(existsSync(options.cacheRoot), false);
    });
  }
});

test('a pin must name a commit object directly, without peeling tags or accepting trees/blobs', async t => {
  for (const type of ['tag', 'replaced tag', 'tree', 'blob']) {
    await t.test(type, t => {
      const options = gitFixture(t);
      const { git, sha } = options;
      let object;
      if (type.endsWith('tag')) {
        object = git(['mktag'], `object ${sha}\ntype commit\ntag fixture\ntagger Fixture <fixture@example.invalid> 1700000000 +0000\n\nfixture tag\n`);
        if (type === 'replaced tag') git(['replace', '-f', object, sha]);
      } else {
        object = git(['rev-parse', `${sha}:${type === 'tree' ? 'functions' : 'functions/src/marker.js'}`]);
      }
      writeFileSync(options.pinFile, JSON.stringify({ sha: object }));
      assert.throws(() => prepareServerSource(options), new RegExp(`Server pin ${object} must name a commit object; found ${type.endsWith('tag') ? 'tag' : type}`));
    });
  }
});

test('replacement refs cannot change the bytes archived for a commit pin', t => {
  const options = gitFixture(t);
  const { git, sha, repository } = options;
  writeFileSync(join(repository, 'functions/src/marker.js'), 'replacement source\n');
  git(['add', 'functions/src/marker.js']);
  const replacement = git(['commit-tree', git(['write-tree'])], 'replacement fixture\n');
  git(['replace', sha, replacement]);
  assert.equal(git(['show', `${sha}:functions/src/marker.js`]), 'replacement source');
  const source = prepareServerSource(options);
  assert.equal(source.sha, sha);
  assert.equal(readFileSync(join(source.root, 'src/marker.js'), 'utf8'), 'pinned source\n');
  assert.equal(git(['replace', '-l']), sha);
});

test('matching donor dependencies report the archived lockfile versions', t => {
  const { root, dependenciesRoot } = dependencyFixture(t);
  assert.deepEqual(verifyServerDependencies(root, dependenciesRoot), versions);
});

test('each donor dependency must match the archived lockfile, not donor metadata', async t => {
  for (const name of Object.keys(versions)) {
    await t.test(name, t => {
      const { root, dependenciesRoot } = dependencyFixture(t);
      writeFileSync(join(dependenciesRoot, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '0.0.0' }));
      writeFileSync(join(dependenciesRoot, 'package-lock.json'), JSON.stringify({ packages: { [`node_modules/${name}`]: { version: '0.0.0' } } }));
      assert.throws(() => verifyServerDependencies(root, dependenciesRoot), error => {
        assert.match(error.message, new RegExp(`Functions dependency mismatch for ${name}`));
        assert.ok(error.message.includes(`expected ${versions[name]}`));
        assert.match(error.message, /found 0\.0\.0.*install Functions dependencies/);
        return true;
      });
    });
  }
});

test('missing donor dependencies give an install diagnostic', t => {
  const { root, dependenciesRoot } = dependencyFixture(t);
  rmSync(join(dependenciesRoot, 'node_modules'), { recursive: true });
  assert.throws(() => verifyServerDependencies(root, dependenciesRoot), /Cannot resolve Functions dependency typescript.*install Functions dependencies/);
});

test('the archived lockfile must contain an exact version for every borrowed dependency', t => {
  const { root, dependenciesRoot } = dependencyFixture(t);
  for (const version of [undefined, null, '', 123]) {
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/typescript': { version } } }));
    assert.throws(() => verifyServerDependencies(root, dependenciesRoot), /Pinned Functions lockfile has no version for typescript/);
  }
});
