// Checks source/dependency admission, interrupted archive recovery and merchant release gates using the local SDK/HTTP adapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import SkyzaiPay from '../src/index.js';
import { startSkyzaiServer, transfer } from './helpers/skyzai-server.js';
import { readServerPin } from './helpers/server-source.js';
import { startArchiveWorker } from './helpers/archive-worker.js';

test('handler source matches the committed pin and is isolated from donor working files', async t => {
  const server = await startSkyzaiServer();
  t.after(server.close);
  const { root, sha } = server.source;
  assert.notEqual(root, resolve(process.env.SKYZAI_APP_ROOT, 'functions'));
  const expected = execFileSync('git', ['-C', process.env.SKYZAI_APP_ROOT, 'show', `${sha}:functions/src/payment/createPayment.ts`], { encoding: 'utf8' });
  assert.equal(readFileSync(join(root, 'src/payment/createPayment.ts'), 'utf8'), expected);
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  assert.deepEqual(server.source.dependencyVersions, Object.fromEntries(['typescript', 'jsonwebtoken'].map(name => [name, lock.packages[`node_modules/${name}`].version])));
});

test('handler startup admits locked dependencies and refuses drift or absent installs', async t => {
  const donor = resolve(process.env.SKYZAI_APP_ROOT);
  const requireDonor = createRequire(join(donor, 'functions/package.json'));
  const dependencyReceipt = ['typescript', 'jsonwebtoken'].map(name => `${name}=${JSON.parse(readFileSync(requireDonor.resolve(`${name}/package.json`), 'utf8')).version}`).join(' ');
  const cache = new URL('./.cache/', import.meta.url);
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(new URL('./dependency-admission-', cache));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gitDirectory = execFileSync('git', ['-C', donor, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  const helper = new URL('./helpers/skyzai-server.js', import.meta.url).href;
  for (const changed of ['matching', 'typescript', 'jsonwebtoken', 'missing']) {
    await t.test(changed, () => {
      const repository = join(directory, changed);
      mkdirSync(repository);
      // Borrow Git objects read-only; package manifests below belong only to this disposable donor.
      symlinkSync(gitDirectory, join(repository, '.git'), 'dir');
      if (changed !== 'missing') {
        for (const name of ['typescript', 'jsonwebtoken']) {
          const packageRoot = join(repository, 'functions/node_modules', name);
          mkdirSync(packageRoot, { recursive: true });
          const metadata = JSON.parse(readFileSync(requireDonor.resolve(`${name}/package.json`), 'utf8'));
          metadata.main = requireDonor.resolve(name);
          if (name === changed) metadata.version = '0.0.0';
          writeFileSync(join(packageRoot, 'package.json'), JSON.stringify(metadata));
        }
      }
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import { startSkyzaiServer } from ${JSON.stringify(helper)};
        try {
          const server = await startSkyzaiServer();
          await server.close();
          console.log('HANDLER_STARTED');
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      `], { env: { ...process.env, SKYZAI_APP_ROOT: repository }, encoding: 'utf8', timeout: 10_000 });
      assert.equal(result.error, undefined);
      if (changed === 'matching') {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /\[skyzai test source\]/);
        assert.ok(result.stdout.includes(dependencyReceipt), result.stdout);
        assert.match(result.stdout, /HANDLER_STARTED/);
        return;
      }
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, changed === 'missing'
        ? /Cannot resolve Functions dependency typescript.*install Functions dependencies/
        : new RegExp(`Functions dependency mismatch for ${changed}.*found 0\\.0\\.0`));
      assert.doesNotMatch(result.stdout, /HANDLER_STARTED/);
    });
  }
});

test('real handler startup and SDK payment ignore donor replacement refs', t => {
  const donor = resolve(process.env.SKYZAI_APP_ROOT);
  const sha = readServerPin();
  const cache = new URL('./.cache/', import.meta.url);
  mkdirSync(cache, { recursive: true });
  const repository = mkdtempSync(new URL('./replacement-admission-', cache));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const git = (args, input) => execFileSync('git', ['-C', repository, ...args], {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  }).trim();
  git(['init', '--quiet']);
  const objects = execFileSync('git', ['-C', donor, 'rev-parse', '--path-format=absolute', '--git-path', 'objects'], { encoding: 'utf8' }).trim();
  // Alternates read donor objects, while replacement refs and new objects stay in the disposable repository.
  writeFileSync(join(repository, '.git/objects/info/alternates'), `${objects}\n`);
  symlinkSync(join(donor, 'functions'), join(repository, 'functions'), 'dir');
  const replacement = git(['commit-tree', git(['mktree'], '')], 'fixture without Functions\n');
  git(['replace', sha, replacement]);
  assert.equal(git(['ls-tree', sha]), '');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import SkyzaiPay from ${JSON.stringify(new URL('../src/index.js', import.meta.url).href)};
    import { startSkyzaiServer } from ${JSON.stringify(new URL('./helpers/skyzai-server.js', import.meta.url).href)};
    const server = await startSkyzaiServer();
    try {
      assert.equal(server.source.sha, ${JSON.stringify(sha)});
      const sdk = new SkyzaiPay({ apiKey: server.apiKey, baseURL: server.baseURL });
      const payment = await sdk.payments.create({ amount: '1', currency: 'USDC' });
      assert.equal(payment.status, 'pending');
      console.log('PINNED_HANDLER_PAYMENT_OK');
    } finally {
      await server.close();
    }
  `], { env: { ...process.env, SKYZAI_APP_ROOT: repository }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes(`server_sha=${sha}`), result.stdout);
  assert.match(result.stdout, /PINNED_HANDLER_PAYMENT_OK/);
  assert.equal(git(['replace', '-l']), sha);
});

test('actual handler startup clearly rejects pins without the Functions source layout', async t => {
  const cache = new URL('./.cache/', import.meta.url);
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(new URL('./layout-admission-', cache));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const layout of ['no-functions', 'no-src']) {
    await t.test(layout, () => {
      const repository = join(directory, layout);
      mkdirSync(join(repository, 'test/helpers'), { recursive: true });
      // Copy the real entry point and config into a disposable SDK; never mutate the committed pin.
      for (const name of ['skyzai-server.js', 'server-source.js']) {
        copyFileSync(new URL(`./helpers/${name}`, import.meta.url), join(repository, 'test/helpers', name));
      }
      const git = (args, input) => execFileSync('git', ['-C', repository, ...args], {
        input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
      }).trim();
      git(['init', '--quiet']);
      if (layout === 'no-src') {
        mkdirSync(join(repository, 'functions'));
        writeFileSync(join(repository, 'functions/package-lock.json'), '{}');
        git(['add', 'functions/package-lock.json']);
      }
      const sha = git(['commit-tree', git(['write-tree'])], 'incomplete Functions layout\n');
      writeFileSync(join(repository, 'test/server-pin.json'), JSON.stringify({ sha }));
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import { startSkyzaiServer } from ${JSON.stringify(pathToFileURL(join(repository, 'test/helpers/skyzai-server.js')).href)};
        try {
          const server = await startSkyzaiServer();
          await server.close();
          console.log('HANDLER_STARTED');
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      `], { env: { ...process.env, SKYZAI_APP_ROOT: repository }, encoding: 'utf8', timeout: 10_000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, new RegExp(`Pinned server commit ${sha} must contain the functions/src directory`));
      assert.doesNotMatch(result.stdout, /HANDLER_STARTED/);
      assert.equal(existsSync(join(repository, 'test/.cache')), false);
    });
  }
});

test('actual SDK/handler runs clean interrupted archives and recover after SIGKILL without pruning live runs', async t => {
  const cache = new URL('./.cache/', import.meta.url);
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(new URL('./lifecycle-admission-', cache));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'test/helpers'), { recursive: true });
  for (const name of ['skyzai-server.js', 'server-source.js']) {
    copyFileSync(new URL(`./helpers/${name}`, import.meta.url), join(directory, 'test/helpers', name));
  }
  copyFileSync(new URL('./server-pin.json', import.meta.url), join(directory, 'test/server-pin.json'));
  const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  symlinkSync(gitDirectory, join(directory, '.git'), 'dir');
  const script = `
    import { startSkyzaiServer } from ${JSON.stringify(pathToFileURL(join(directory, 'test/helpers/skyzai-server.js')).href)};
    import SkyzaiPay from ${JSON.stringify(new URL('../src/index.js', import.meta.url).href)};
    const server = await startSkyzaiServer();
    const sdk = new SkyzaiPay({ apiKey: server.apiKey, baseURL: server.baseURL });
    const payment = await sdk.payments.create({ amount: '10.123456', currency: 'USDC', network: 'mainnet' });
    process.send({ root: server.source.root, status: payment.status, baseURL: server.baseURL });
  `;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    await t.test(signal, async t => {
      const worker = await startArchiveWorker(t, script);
      assert.equal(worker.status, 'pending');
      worker.child.kill(signal);
      await worker.exited;
      assert.equal(existsSync(dirname(worker.root)), false, `${signal} must clean actual-handler sources`);
    });
  }
  await t.test('SIGKILL restart preserves concurrent handler', async t => {
    const live = await startArchiveWorker(t, script);
    const killed = await startArchiveWorker(t, script);
    killed.child.kill('SIGKILL');
    assert.deepEqual(await killed.exited, { code: null, signal: 'SIGKILL' });
    assert.ok(existsSync(killed.root));
    const restarted = await startArchiveWorker(t, script);
    assert.equal(existsSync(dirname(killed.root)), false, 'restart must prune actual-handler dead sources');
    for (const worker of [live, restarted]) {
      assert.equal(worker.status, 'pending');
      assert.ok(existsSync(join(worker.root, 'src/payment/createPayment.ts')));
      const response = await fetch(`${worker.baseURL}/unknown-local-route`);
      assert.equal(response.status, 404, 'surviving loopback server must remain usable');
      await response.text();
      worker.child.send('exit');
      assert.deepEqual(await worker.exited, { code: 0, signal: null });
      assert.equal(existsSync(dirname(worker.root)), false);
    }
  });
});

// Release gates owned by the separate Skyzai server change, never hidden with skips.
test('merchant completion rejects an on-chain transfer made after expiry', async t => {
  const server = await startSkyzaiServer();
  t.after(server.close);
  const sdk = new SkyzaiPay({ apiKey: server.apiKey, baseURL: server.baseURL });
  const payment = await sdk.payments.create({ amount: '10.123456', currency: 'USDC', network: 'mainnet' });
  const expiresAt = payment.expiresAt.getTime();
  server.setNow(expiresAt + 1000);
  server.setMirror([transfer(payment.id, 10_123_456, { consensus_timestamp: `${Math.floor(expiresAt / 1000) + 1}.000000000` })]);
  await assert.rejects(server.complete({
    auth: { uid: 'buyer', token: { firebase: { sign_in_provider: 'password' } } },
    data: { transactionId: payment.id, onChainTransactionId: '0.0.7001-1700000000-111111111' },
  }), { code: 'failed-precondition' });
});

test('merchant HTTP endpoints bind the JWT secret required by validateJWT', async t => {
  const server = await startSkyzaiServer();
  t.after(server.close);
  for (const [path, options] of Object.entries(server.endpointOptions)) {
    assert.ok(options.secrets?.some(secret => secret === 'JWT_SECRET' || secret.name === 'JWT_SECRET'), `${path} must bind JWT_SECRET`);
  }
});

test('real getPayment surfaces expiry and SDK stops monitoring immediately', async t => {
  const server = await startSkyzaiServer();
  t.after(server.close);
  const sdk = new SkyzaiPay({ apiKey: server.apiKey, baseURL: server.baseURL });
  const payment = await sdk.payments.create({ amount: '1', currency: 'USDC' });
  t.after(() => payment.stopListening());
  const stored = server.db.docs.get(`transactions/${payment.id}`);
  stored.createdAt = Date.now() - 900_001;
  stored.expiresAt = Date.now() - 1;
  let emitted = false;
  payment.on('expired', () => { emitted = true; });
  await payment.refresh();
  assert.equal(payment.status, 'expired');
  payment.startListening();
  assert.equal(emitted, true);
  assert.equal(payment._listening, false);
  assert.equal(payment.listener, null);
});
