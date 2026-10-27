// Exercises merchant SDK requests against current local server handlers without cloud access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import SkyzaiPay, { SkyzaiPayError } from '../src/index.js';
import { startSkyzaiServer, transfer } from './helpers/skyzai-server.js';

const CHAIN_TX = '0.0.7001-1700000000-111111111';
async function setup(t, options) {
  const server = await startSkyzaiServer(options);
  t.after(server.close);
  return { server, sdk: new SkyzaiPay({ apiKey: server.apiKey, baseURL: server.baseURL, pollInterval: 10 }) };
}
function buyerRequest(id) {
  return { auth: { uid: 'buyer', token: { firebase: { sign_in_provider: 'password' } } }, data: { transactionId: id, onChainTransactionId: CHAIN_TX } };
}

// Reviewer's invalid quotes and valid settlement controls, using real token resolution.
for (const [currency, decimals, amount, units] of [
  ['USDT', 6, '1.0000001', null],
  ['USDC', 2, '1.001', null],
  ['USDT', 6, '1.000001', 1_000_001],
  ['USDC', 2, '1.23', 123],
  ['USD', 2, '1.001', null],
  ['USDC', 8, '0.00000001', 1],
  ['USD', 8, '0.00000001', 1],
  ['USDC', 18, '0.000000000000000001', 1],
  ['USDT', 2, '1.2300', 123],
]) {
  test(`${currency} decimals=${decimals} amount=${amount}: ${units === null ? 'refused before invoice creation' : 'settles'}`, async t => {
    const { server, sdk } = await setup(t);
    const tokenId = '0.0.8001';
    server.db.docs.set('appConfig/skyzaiPay', {
      mainnet: { tokens: { [currency === 'USD' ? 'USDC' : currency]: { tokenId, decimals } } },
    });
    if (units === null) {
      await assert.rejects(sdk.payments.create({ amount, currency }), {
        name: 'SkyzaiPayError', status: 400, code: 'AMOUNT_NOT_REPRESENTABLE',
      });
      assert.equal([...server.db.docs.keys()].some(path => path.startsWith('transactions/')), false);
      return;
    }
    const payment = await sdk.payments.create({ amount, currency });
    const evidence = transfer(payment.id, units);
    evidence.token_transfers = evidence.token_transfers.map(line => ({ ...line, token_id: tokenId }));
    server.setMirror([evidence]);
    server.setNow(Date.now());
    assert.equal((await server.complete(buyerRequest(payment.id))).status, 'completed');
    await payment.refresh();
    assert.equal(payment.status, 'completed');
  });
}

// Keep raw HTTP admission aligned with buyer syntax, independent of SDK validation.
for (const [currency, decimals, amount, network] of [
  ['USDC', 2, ' 1.23', 'mainnet'],
  ['USDC', 2, '1.23 ', 'mainnet'],
  ['USDC', 2, '\t1.23', 'mainnet'],
  ...['mainnet', 'testnet'].flatMap(network => [
    ['USDT', 6, '1.0000001', network],
    ['USDC', 2, '1.001', network],
    ['USD', 2, '1.001', network],
    ['USDC', 19, '0.0000000000000000001', network],
    ['USDT', 20, '0.00000000000000000001', network],
    ['USD', 30, '0.000000000000000000000000000001', network],
  ]),
]) {
  test(`raw ${network} ${currency} amount=${JSON.stringify(amount)} refuses before invoice allocation`, async t => {
    const { server, sdk } = await setup(t);
    let allocations = 0;
    let writes = 0;
    const collection = server.db.collection.bind(server.db);
    server.db.collection = name => {
      const result = collection(name);
      if (name !== 'transactions') return result;
      const doc = result.doc.bind(result);
      return { ...result, doc: (...args) => {
        allocations++;
        const ref = doc(...args);
        return { ...ref, set: (...values) => { writes++; return ref.set(...values); } };
      } };
    };
    server.db.docs.set('appConfig/skyzaiPay', {
      [network]: { tokens: { [currency === 'USD' ? 'USDC' : currency]: { tokenId: '0.0.8001', decimals } } },
    });
    const response = await fetch(`${server.baseURL}/createPayment`, {
      method: 'POST', headers: { Authorization: `Bearer ${server.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency, network }),
    });
    const body = await response.json();
    if (decimals > 18) {
      for (const create of [sdk.payments.create, sdk.createPayment.bind(sdk)]) {
        await assert.rejects(create({ amount, currency, network }), {
          name: 'SkyzaiPayError', status: 400, code: 'AMOUNT_NOT_REPRESENTABLE',
        });
      }
    }
    assert.deepEqual({ status: response.status, allocations, writes,
      invoices: [...server.db.docs.keys()].filter(path => path.startsWith('transactions/')).length },
    { status: 400, allocations: 0, writes: 0, invoices: 0 }, JSON.stringify(body));
    assert.equal(body.error, 'Amount cannot be represented safely in configured token units');
  });
}

test('raw merchant HTTP create rejects invalid amounts and unsafe verification units before writing invoices', async t => {
  const { server } = await setup(t);
  for (const [decimals, amount] of [
    [6, '0.0000001'], [6, '9007199254.740992'], [6, '9007199254.740991'],
    [6, '-1'], [6, '0'], [6, '1e3'], [6, {}], [6, '1'.repeat(101)],
    [-1, '1'], [31, '1'], [0, '1.1'],
  ]) {
    server.db.docs.set('appConfig/skyzaiPay', {
      mainnet: { tokens: { USDT: { tokenId: '0.0.8001', decimals } } },
    });
    const response = await fetch(`${server.baseURL}/createPayment`, {
      method: 'POST', headers: { Authorization: `Bearer ${server.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'USDT', network: 'mainnet' }),
    });
    assert.equal(response.status, 400, `decimals=${decimals} amount=${JSON.stringify(amount)}`);
    assert.equal((await response.json()).error, 'Amount cannot be represented safely in configured token units');
    assert.equal([...server.db.docs.keys()].some(path => path.startsWith('transactions/')), false);
  }
});

test('merchant create/get/cancel shapes retain checkout data and normalize response fields', async t => {
  const { server, sdk } = await setup(t);
  const request = { amount: '1.250000', currency: 'USD', network: 'mainnet', metadata: { orderId: 'shape-order', items: 2 } };
  const payment = await sdk.payments.create(request);
  assert.deepEqual(server.calls[0], { path: '/createPayment', method: 'POST', query: {}, body: request });
  assert.equal(payment.paymentId, payment.id);
  assert.equal(payment.amount, request.amount);
  assert.equal(payment.currency, request.currency);
  assert.equal(payment.getQRCode(), `skyzai://pay?id=${payment.id}`);
  assert.equal(payment.getDeepLink(), payment.getQRCode());
  for (const field of ['userId', 'userName', 'userEmail', 'createdAt', 'confirmedAt', 'updatedAt', 'txHash']) {
    assert.equal(payment[field], null, `${field} is absent or null at creation`);
  }
  assert.deepEqual(payment.metadata, {});
  const stored = server.db.docs.get(`transactions/${payment.id}`);
  assert.deepEqual(stored.metadata, request.metadata);
  assert.deepEqual(payment.destinations, stored.destinations);
  assert.equal(payment.expiresAt.getTime(), stored.expiresAt);

  assert.equal(await payment.refresh(), payment);
  assert.deepEqual(server.calls[1], { path: '/getPayment', method: 'GET', query: { id: payment.id }, body: {} });
  assert.deepEqual(payment.metadata, request.metadata);
  assert.equal(payment.userId, 'merchant');
  assert.equal(payment.userEmail, 'merchant@example.invalid');
  assert.equal(payment.userName, 'Local merchant');
  for (const field of ['createdAt', 'expiresAt', 'updatedAt']) assert.equal(payment[field].getTime(), stored[field]);

  const cancelled = await sdk.payments.cancel(payment.id);
  assert.deepEqual(server.calls[2], { path: '/cancelPayment', method: 'POST', query: {}, body: { paymentId: payment.id } });
  assert.notEqual(cancelled, payment);
  assert.equal(cancelled.id, payment.id);
  assert.equal(cancelled.userId, payment.userId); // get returns userId; cancel returns uId.
  for (const field of ['amount', 'currency', 'userName', 'userEmail', 'metadata', 'destinations', 'qrCode', 'deepLink', 'createdAt', 'expiresAt', 'txHash', 'confirmedAt']) {
    assert.deepEqual(cancelled[field], payment[field], `${field} survives cancellation`);
  }
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.updatedAt.getTime(), server.db.docs.get(`transactions/${payment.id}`).updatedAt);
  assert.equal(payment.status, 'pending');
  await payment.refresh();
  assert.equal(payment.status, 'cancelled');
});

test('merchant status projection and cancellation fail closed for every stored lifecycle value', async t => {
  const { server, sdk } = await setup(t);
  for (const [storedStatus, status, refusal] of [
    ['pending', 'pending', null],
    ['completed', 'completed', 'Cannot cancel a completed payment'],
    ['confirmed', 'confirmed', 'Cannot cancel a confirmed payment'],
    ['cancelled', 'cancelled', 'Payment is already cancelled'],
    ['expired', 'expired', 'Cannot cancel a payment with an unknown status'],
    ['unknown', 'unknown', 'Cannot cancel a payment with an unknown status'],
    ['failed', 'unknown', 'Cannot cancel a payment with an unknown status'],
    ['future-status', 'unknown', 'Cannot cancel a payment with an unknown status'],
    [null, 'unknown', 'Cannot cancel a payment with an unknown status'],
    [undefined, 'unknown', 'Cannot cancel a payment with an unknown status'],
  ]) {
    await t.test(String(storedStatus), async () => {
      const created = await sdk.payments.create({ amount: '1', currency: 'USDC' });
      const path = `transactions/${created.id}`;
      server.db.docs.get(path).status = storedStatus;
      const before = structuredClone(server.db.docs.get(path));
      const payment = await sdk.payments.get(created.id);
      t.after(() => payment.stopListening());
      assert.equal(payment.status, status);
      const events = [];
      for (const event of ['completed', 'confirmed', 'expired', 'cancelled', 'failed']) payment.on(event, () => events.push(event));
      await payment.refresh();
      const expectedEvents = ['completed', 'confirmed', 'expired', 'cancelled'].includes(status) ? [status] : [];
      if (status === 'completed') expectedEvents.push('confirmed');
      assert.deepEqual(events, expectedEvents);
      assert.deepEqual(server.db.docs.get(path), before, 'reads must not rewrite the stored status');
      if (refusal) {
        await assert.rejects(sdk.payments.cancel(created.id), {
          name: 'SkyzaiPayError', status: 400, code: 'HTTP_ERROR', message: `Skyzai Pay: ${refusal}`,
        });
        assert.deepEqual(server.db.docs.get(path), before, 'refused cancellation must preserve the invoice');
      } else {
        assert.equal((await sdk.payments.cancel(created.id)).status, 'cancelled');
      }
    });
  }
});

for (const [older, newer] of [['refresh', 'poll'], ['poll', 'refresh'], ['refresh', 'refresh']]) {
  test(`delayed ${older} cannot overwrite real buyer completion observed by ${newer}`, async t => {
    const { server, sdk } = await setup(t);
    const payment = await sdk.payments.create({ amount: '10.123456', currency: 'USDC' });
    t.after(() => payment.stopListening());
    let capture;
    const captured = new Promise(resolve => { capture = resolve; });
    let release;
    const held = new Promise(resolve => { release = resolve; });
    t.after(release);
    const getPaymentData = sdk._getPaymentData.bind(sdk);
    let reads = 0;
    let delivered;
    // Delay delivery of the first real HTTP result without replacing any handler.
    sdk._getPaymentData = async id => {
      const first = ++reads === 1;
      const result = await getPaymentData(id);
      if (first) {
        capture(result);
        await held;
        delivered();
      }
      return result;
    };
    const staleDelivered = new Promise(resolve => { delivered = resolve; });
    const statuses = [];
    payment.on('status_change', status => statuses.push(status));
    let confirmations = 0;
    payment.on('confirmed', () => { confirmations++; });
    const staleRefresh = older === 'refresh' ? payment.refresh() : payment.startListening();
    assert.equal((await captured).status, 'pending');
    server.setMirror([transfer(payment.id)]);
    server.setNow(Date.now());
    const result = await server.complete(buyerRequest(payment.id));
    assert.equal(result.status, 'completed');
    if (newer === 'refresh') await payment.refresh();
    else {
      const completed = once(payment, 'completed', { signal: AbortSignal.timeout(3000) });
      payment.startListening();
      await completed;
    }
    release();
    await staleRefresh;
    await staleDelivered;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(payment.status, 'completed');
    assert.equal(payment.txHash, CHAIN_TX);
    assert.equal(payment.confirmedAt.getTime(), Date.parse(result.confirmedAt));
    assert.equal(payment._listening, false);
    assert.equal(payment.listener, null);
    assert.equal(confirmations, 1);
    assert.deepEqual(statuses, ['completed']);
    assert.equal((await sdk.payments.get(payment.id)).status, 'completed');
  });
}

test('real key generation -> SDK create/get/monitor -> buyer completion -> SDK completed', async t => {
  const { server, sdk } = await setup(t);
  assert.equal(server.db.docs.get(`APIKeys/${server.keyId}`).generatedBy, 'owner-user');
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
  server.setNow(Date.now());
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

for (const projectId of ['skyzai-16e1b', null]) {
  test(`${projectId === null ? 'unknown' : 'production'} project refuses testnet without creating an invoice`, async t => {
    const { server, sdk } = await setup(t, { projectId });
    await assert.rejects(sdk.payments.create({ amount: '1', currency: 'USDC', network: 'testnet' }), {
      name: 'SkyzaiPayError', status: 403, code: 'TESTNET_NOT_ALLOWED',
    });
    assert.equal([...server.db.docs.keys()].some(path => path.startsWith('transactions/')), false);
    const payment = await sdk.payments.create({ amount: '1', currency: 'USDC' });
    assert.equal((await sdk.payments.get(payment.id)).status, 'pending');
    assert.equal(server.db.docs.get(`transactions/${payment.id}`).network, 'mainnet');
  });
}

test('unconfigured USDT on either network yields a typed refusal without an invoice', async t => {
  const { server, sdk } = await setup(t);
  for (const network of ['mainnet', 'testnet']) {
    await assert.rejects(sdk.payments.create({ amount: '1', currency: 'USDT', network }), {
      name: 'SkyzaiPayError', status: 503, code: 'TOKEN_NOT_CONFIGURED',
    });
  }
  assert.equal([...server.db.docs.keys()].some(path => path.startsWith('transactions/')), false);
});

for (const [network, currency, tokenId] of [
  ['testnet', 'USDC', '0.0.429274'],
  ['testnet', 'USD', '0.0.429274'],
  ['mainnet', 'USDT', '0.0.8001'],
  ['testnet', 'USDT', '0.0.8002'],
]) {
  test(`local ${network} ${currency} invoice settles with its server-selected token`, async t => {
    const { server, sdk } = await setup(t);
    if (currency === 'USDT') {
      server.db.docs.set('appConfig/skyzaiPay', { [network]: { tokens: { USDT: { tokenId, decimals: 6 } } } });
    }
    const payment = await sdk.payments.create({ amount: '1.25', currency, network });
    assert.deepEqual(server.calls[0].body, { amount: '1.25', currency, network, metadata: {} });
    const stored = server.db.docs.get(`transactions/${payment.id}`);
    assert.equal(stored.network, network);
    assert.equal(stored.tokenId, tokenId);
    assert.equal(stored.tokenDecimals, 6);
    assert.equal(stored.tokenSymbol, currency);
    const evidence = transfer(payment.id, 1_250_000);
    server.setMirror([{ ...evidence, token_transfers: evidence.token_transfers.map(item => ({ ...item, token_id: tokenId })) }]);
    server.setNow(Date.now());
    assert.equal((await server.complete(buyerRequest(payment.id))).status, 'completed');
    await payment.refresh();
    assert.equal(payment.status, 'completed');
    assert.equal(payment.amount, '1.25');
    assert.equal(payment.currency, currency);
    assert.equal(payment.txHash, CHAIN_TX);
    assert.equal(server.db.docs.get(`usedHederaTransferIds/${CHAIN_TX}`).network, network);
  });
}

test('merchant re-gating and key invalidation produce typed refusals on every SDK path', async t => {
  const { server, sdk } = await setup(t);
  const payment = await sdk.payments.create({ amount: '1', currency: 'USDC' });
  t.after(() => payment.stopListening());
  const businessPath = 'Users/merchant';
  const keyPath = `APIKeys/${server.keyId}`;
  const controlPath = 'APIKeys/merchant_merchant';
  const originals = [businessPath, keyPath, controlPath].map(path => [path, { ...server.db.docs.get(path) }]);
  for (const [label, path, patch, code] of [
    ['KYB withdrawn', businessPath, { kybStatus: 'pending' }, 'BUSINESS_NOT_APPROVED'],
    ['business closed', businessPath, { kybRelationshipEndedAt: 1 }, 'BUSINESS_NOT_APPROVED'],
    ['business type removed', businessPath, { userType: 'personal' }, 'BUSINESS_NOT_APPROVED'],
    ['account flagged', businessPath, { isFlagged: true }, 'ACCOUNT_BLOCKED'],
    ['account blocked', businessPath, { autoBlock: true }, 'ACCOUNT_BLOCKED'],
    ['key revoked', keyPath, { revoked: true }, 'API_KEY_REVOKED'],
    ['key superseded', controlPath, { activeKeyId: 'replacement-key' }, 'API_KEY_REVOKED'],
  ]) {
    await t.test(label, async () => {
      for (const [originalPath, value] of originals) server.db.docs.set(originalPath, { ...value });
      server.db.docs.set(path, { ...server.db.docs.get(path), ...patch });
      const assertRefusal = error => {
        assert.ok(error instanceof SkyzaiPayError);
        assert.equal(error.name, 'SkyzaiPayError');
        assert.equal(error.status, 403);
        assert.equal(error.code, code);
        assert.ok(!error.message.includes(server.apiKey));
        return true;
      };
      for (const operation of [
        () => sdk.payments.create({ amount: '1', currency: 'USDC' }),
        () => sdk.payments.get(payment.id),
        () => sdk.payments.cancel(payment.id),
        () => payment.refresh(),
      ]) await assert.rejects(operation, assertRefusal);
      const refused = once(payment, 'error', { signal: AbortSignal.timeout(3000) });
      payment.startListening();
      assertRefusal((await refused)[0]);
      assert.equal(payment._listening, false);
      assert.equal(payment.listener, null);
      assert.equal(payment.status, 'pending');
      assert.equal(server.db.docs.get(`transactions/${payment.id}`).status, 'pending');
    });
  }
});

test('real completion rejects underpayment, wrong token, wrong memo, failed and missing transfers', async t => {
  const { server, sdk } = await setup(t);
  const payment = await sdk.payments.create({ amount: '10.123456', currency: 'USDC' });
  for (const tx of [
    transfer(payment.id, 10_123_455),
    transfer(payment.id, 10_123_456, { token_transfers: [{ token_id: '0.0.1', account: '0.0.9000', amount: 10_123_456 }] }),
    transfer('another-payment'),
    transfer(payment.id, 10_123_456, { result: 'FAIL_INVALID' }),
    transfer(payment.id, 10_123_456, { transaction_id: undefined }),
  ]) {
    server.setMirror([tx]);
    await assert.rejects(server.complete(buyerRequest(payment.id)), { code: 'failed-precondition' });
    assert.equal((await sdk.payments.get(payment.id)).status, 'pending');
  }
  server.setMirror(null);
  await assert.rejects(server.complete(buyerRequest(payment.id)), { code: 'not-found' });
});

test('server expired state stops monitoring without emitting success', async t => {
  const { server, sdk } = await setup(t);
  const payment = await sdk.payments.create({ amount: '1', currency: 'USDC' });
  t.after(() => payment.stopListening());
  payment.on('confirmed', () => assert.fail('Unpaid request must not confirm'));
  const expired = once(payment, 'expired', { signal: AbortSignal.timeout(3000) });
  payment.startListening();
  server.db.docs.get(`transactions/${payment.id}`).status = 'expired';
  await expired;
  assert.equal(payment._listening, false);
});

test('an expired SDK snapshot can refresh to completed when timely proof arrives later', async t => {
  const { server, sdk } = await setup(t);
  const payment = await sdk.payments.create({ amount: '10.123456', currency: 'USDC' });
  t.after(() => payment.stopListening());
  const now = Date.now();
  const stored = server.db.docs.get(`transactions/${payment.id}`);
  stored.createdAt = now - 901_000;
  stored.expiresAt = Math.floor((now - 1000) / 1000) * 1000;
  const statuses = [];
  let confirmations = 0;
  payment.on('status_change', status => statuses.push(status));
  payment.on('confirmed', () => { confirmations++; });
  const expired = once(payment, 'expired', { signal: AbortSignal.timeout(3000) });
  payment.startListening();
  await expired;
  assert.equal(payment.isExpired(), true);
  assert.equal(payment._listening, false);
  assert.equal(payment.listener, null);
  assert.equal(confirmations, 0);
  assert.equal(stored.status, 'pending');

  // Consensus just before expiry remains eligible regardless of confirmation arrival time.
  server.setMirror([transfer(payment.id, 10_123_456, {
    consensus_timestamp: `${Math.floor(stored.expiresAt / 1000) - 1}.999999999`,
  })]);
  server.setNow(now + 86_400_000);
  const result = await server.complete(buyerRequest(payment.id));
  await payment.refresh();
  assert.equal(payment.status, 'completed');
  assert.equal(payment.isExpired(), false);
  assert.equal(payment.txHash, CHAIN_TX);
  assert.equal(payment.confirmedAt.getTime(), Date.parse(result.confirmedAt));
  await payment.refresh();
  payment.startListening();
  assert.deepEqual(statuses, ['expired', 'completed']);
  assert.equal(confirmations, 1);
  assert.equal(payment._listening, false);
  assert.equal((await sdk.payments.get(payment.id)).status, 'completed');
  await assert.rejects(sdk.payments.cancel(payment.id), /Cannot cancel a completed payment/);
});

for (const cancel of [false, true]) {
  test(`${cancel ? 'cancelling an elapsed invoice' : 'consensus exactly at expiry'} retains private review evidence without SDK success`, async t => {
    const { server, sdk } = await setup(t);
    const payment = await sdk.payments.create({ amount: '10.123456', currency: 'USDC' });
    t.after(() => payment.stopListening());
    const now = Date.now();
    const stored = server.db.docs.get(`transactions/${payment.id}`);
    stored.createdAt = now - 901_000;
    stored.expiresAt = Math.floor((now - 1000) / 1000) * 1000;
    await payment.refresh();
    assert.equal(payment.status, 'expired');
    assert.equal(stored.status, 'pending');
    if (cancel) {
      const cancelled = await sdk.payments.cancel(payment.id);
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.userId, 'merchant');
      await payment.refresh();
      assert.equal(payment.status, 'cancelled');
    }
    let confirmations = 0;
    payment.on('confirmed', () => { confirmations++; });
    server.setMirror([transfer(payment.id, 10_123_456, {
      consensus_timestamp: `${stored.expiresAt / 1000 - (cancel ? 1 : 0)}.000000000`,
    })]);
    server.setNow(now);
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(server.complete(buyerRequest(payment.id)), {
        code: 'failed-precondition', details: { recoveryStatus: 'refund_review' },
      });
    }
    await payment.refresh();
    const expectedStatus = cancel ? 'cancelled' : 'expired';
    assert.equal(payment.status, expectedStatus);
    assert.equal(payment.txHash, null);
    assert.equal(payment.confirmedAt, null);
    assert.equal(confirmations, 0);
    const fetched = await sdk._getPaymentData(payment.id);
    assert.equal(fetched.status, expectedStatus);
    assert.equal(fetched.paymentRecoveries, undefined);
    assert.equal(fetched.recoveryStatus, undefined);
    const recoveries = [...server.db.docs].filter(([path]) => path.startsWith(`transactions/${payment.id}/paymentRecoveries/`));
    assert.equal(recoveries.length, 1);
    assert.equal(recoveries[0][1].status, 'refund_review');
    assert.equal(recoveries[0][1].reason, cancel ? 'payment_cancelled' : 'outside_payment_window');
    assert.equal(server.db.docs.has('Users/merchant/meta/paymentSummary'), false);
    assert.equal(server.db.docs.get(`usedHederaTransferIds/${CHAIN_TX}`).claimedBy, payment.id);
  });
}
