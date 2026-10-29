// Checks pinned source/dependency admission and merchant release requirements using the local SDK/HTTP adapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import SkyzaiPay from '../src/index.js';
import { startSkyzaiServer, transfer } from './helpers/skyzai-server.js';

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
