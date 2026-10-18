import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import SkyzaiPay from '../src/index.js';
import { startSkyzaiServer, transfer } from './helpers/skyzai-server.js';

const CHAIN_TX = '0.0.7001-1700000000-111111111';
async function setup(t) {
  const server = await startSkyzaiServer();
  t.after(server.close);
  return { server, sdk: new SkyzaiPay({ apiKey: server.apiKey, baseURL: server.baseURL, pollInterval: 10 }) };
}
function buyerRequest(id) {
  return { auth: { uid: 'buyer', token: { firebase: { sign_in_provider: 'password' } } }, data: { transactionId: id, onChainTransactionId: CHAIN_TX } };
}

test('real key generation -> SDK create/get/monitor -> buyer completion -> SDK completed', async t => {
  const { server, sdk } = await setup(t);
  assert.equal(server.db.docs.get(`APIKeys/${server.keyId}`).generatedBy, 'admin-user');
  const payment = await sdk.payments.create({ amount: '10.123456', currency: 'USDC', metadata: { orderId: 'order-1' } });
  t.after(() => payment.stopListening());
  assert.equal(payment.status, 'pending');
  assert.equal(payment.deepLink, `skyzai://pay?id=${payment.id}`);
  assert.equal(payment.qrCode, payment.deepLink);
  const stored = server.db.docs.get(`transactions/${payment.id}`);
  assert.equal(stored.tokenId, '0.0.456858');
  assert.equal(stored.tokenDecimals, 6);
  assert.equal(stored.amount, '10.123456');
  assert.equal(stored.uId, 'merchant');
  assert.equal(stored.network, 'mainnet');
  const fetched = await sdk.payments.get(payment.id);
  assert.equal(fetched.userId, 'merchant');
  assert.deepEqual(fetched.metadata, { orderId: 'order-1' });
  assert.equal(fetched.expiresAt.getTime() - fetched.createdAt.getTime(), 900_000);
  let confirmations = 0;
  payment.on('confirmed', () => { confirmations++; });
  const completed = once(payment, 'completed', { signal: AbortSignal.timeout(3000) });
  payment.startListening();
  server.setMirror([transfer(payment.id)]);
  const result = await server.complete(buyerRequest(payment.id));
  assert.equal(result.status, 'completed');
  await completed;
  assert.equal(payment.status, 'completed');
  assert.equal(payment.txHash, CHAIN_TX);
  assert.equal(payment.confirmedAt.getTime(), Date.parse(result.confirmedAt));
  assert.equal(payment._listening, false);
  await payment.refresh();
  payment.startListening();
  assert.equal(confirmations, 1);
  assert.equal((await sdk.payments.get(payment.id)).status, 'completed');
  assert.equal(server.db.docs.get(`usedHederaTransferIds/${CHAIN_TX}`).claimedBy, payment.id);
  const summary = server.db.docs.get('Users/merchant/meta/paymentSummary');
  assert.equal(Object.values(summary.months)[0]['USDC:mainnet'].receivedTotal, '10123456');
  await assert.rejects(sdk.payments.cancel(payment.id), /Cannot cancel a completed payment/);
  assert.ok(server.calls.every(call => ['/createPayment', '/getPayment', '/cancelPayment'].includes(call.path)));
});

test('SDK cancel persists through real cancel/get handlers and emits cancelled', async t => {
  const { server, sdk } = await setup(t);
  const payment = await sdk.payments.create({ amount: '1', currency: 'USD' });
  t.after(() => payment.stopListening());
  const cancelled = once(payment, 'cancelled', { signal: AbortSignal.timeout(3000) });
  payment.startListening();
  const result = await sdk.payments.cancel(payment.id);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.userId, 'merchant');
  await cancelled;
  assert.equal((await sdk.payments.get(payment.id)).status, 'cancelled');
  await assert.rejects(sdk.payments.cancel(payment.id), /already cancelled/);
  server.setMirror([transfer(payment.id)]);
  await assert.rejects(server.complete(buyerRequest(payment.id)), { code: 'failed-precondition' });
});

test('real auth, missing payment, ownership and configured-token errors reach the SDK', async t => {
  const { server, sdk } = await setup(t);
  await assert.rejects(sdk.payments.get('missing'), error => error.status === 404);
  await assert.rejects(sdk.payments.create({ amount: '1', currency: 'USDT' }), error => error.status === 503);
  const payment = await sdk.payments.create({ amount: '1', currency: 'USDC' });
  server.db.docs.get(`transactions/${payment.id}`).uId = 'someone-else';
  await assert.rejects(sdk.payments.get(payment.id), error => error.status === 403);
  server.db.docs.get(`APIKeys/${server.keyId}`).revoked = true;
  await assert.rejects(sdk.payments.create({ amount: '1', currency: 'USDC' }), error => error.status === 403 && /revoked/.test(error.message));
  const invalid = new SkyzaiPay({ apiKey: 'invalid', baseURL: server.baseURL });
  await assert.rejects(invalid.payments.get(payment.id), error => error.status === 401);
});

test('real completion rejects underpayment, wrong token, wrong memo, failed and missing transfers', async t => {
  const { server, sdk } = await setup(t);
  const payment = await sdk.payments.create({ amount: '10.123456', currency: 'USDC' });
  for (const tx of [
    transfer(payment.id, 10_123_455),
    transfer(payment.id, 10_123_456, { token_transfers: [{ token_id: '0.0.1', account: '0.0.9000', amount: 10_123_456 }] }),
    transfer('another-payment'),
    transfer(payment.id, 10_123_456, { result: 'FAIL_INVALID' }),
  ]) {
    server.setMirror([tx]);
    await assert.rejects(server.complete(buyerRequest(payment.id)), { code: 'failed-precondition' });
    assert.equal((await sdk.payments.get(payment.id)).status, 'pending');
  }
  server.setMirror(null);
  await assert.rejects(server.complete(buyerRequest(payment.id)), { code: 'not-found' });
});

test('server expired and failed states stop monitoring without emitting success', async t => {
  const { server, sdk } = await setup(t);
  for (const status of ['expired', 'failed']) {
    const payment = await sdk.payments.create({ amount: '1', currency: 'USDC' });
    t.after(() => payment.stopListening());
    payment.on('confirmed', () => assert.fail('Unpaid request must not confirm'));
    const terminal = once(payment, status, { signal: AbortSignal.timeout(3000) });
    payment.startListening();
    // A stored server state is separate from the expiry enforcement release gate.
    server.db.docs.get(`transactions/${payment.id}`).status = status;
    await terminal;
    assert.equal(payment._listening, false);
  }
});
