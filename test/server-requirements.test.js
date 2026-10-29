// Checks the pinned handler source boundary and merchant release requirements using the local SDK/HTTP adapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
