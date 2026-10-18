import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import SkyzaiPay, { SkyzaiPay as NamedSkyzaiPay, AureusPay, Payment } from '../src/index.js';

const data = { paymentId: 'pay-1', status: 'pending', amount: '1', currency: 'USDC', expiresAt: Date.now() + 900000, deepLink: 'skyzai://pay?id=pay-1' };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('default/named exports and deprecated class alias use Skyzai exclusively', () => {
  assert.equal(SkyzaiPay, NamedSkyzaiPay);
  assert.equal(AureusPay, SkyzaiPay);
  const sdk = new SkyzaiPay({ apiKey: 'secret-fixture' });
  assert.equal(sdk.baseURL, 'https://us-central1-skyzai-16e1b.cloudfunctions.net');
  assert.equal(sdk.payments.complete, undefined);
  assert.ok(!JSON.stringify(sdk).includes('secret-fixture'));
  assert.ok(!JSON.stringify(new Payment(data, sdk)).includes('secret-fixture'));
});

test('credentials, endpoint and timers are validated before any network request', () => {
  for (const config of [{}, { apiKey: '' }, { customToken: 'old-mode' }, { getIdToken: () => 'old-mode' }]) {
    assert.throws(() => new SkyzaiPay(config), /merchant API key/);
  }
  for (const baseURL of ['https://example.invalid', 'https://us-central1-aureus-money.cloudfunctions.net', 'http://169.254.169.254', 'https://user:pass@us-central1-skyzai-16e1b.cloudfunctions.net']) {
    assert.throws(() => new SkyzaiPay({ apiKey: 'fixture', baseURL }), /Skyzai backend/);
  }
  for (const pollInterval of [0, -1, NaN, 2147483648]) assert.throws(() => new SkyzaiPay({ apiKey: 'fixture', pollInterval }));
});

test('amounts use exact decimal token units and reject rounding or unsafe values', async () => {
  const sdk = new SkyzaiPay({ apiKey: 'fixture' });
  const requests = [];
  sdk._request = async (_path, _method, body) => { requests.push(body); return { ...data, ...body }; };
  for (const amount of ['0', '-1', 'NaN', Infinity, '1e3', '01', '0.0000001', '9007199254.740992', '9007199254.740991', {}, null]) {
    await assert.rejects(sdk.payments.create({ amount, currency: 'USDC' }), /amount|USDC/);
  }
  for (const amount of ['0.000001', '10.123456', '9007199254.740990', 1.25]) {
    const payment = await sdk.payments.create({ amount, currency: 'USDC' });
    assert.equal(payment.amount, String(amount));
  }
  assert.equal(requests.length, 4);
  assert.equal(requests[1].amount, '10.123456');
  for (const extra of [{ currency: 'HBAR' }, { network: 'unknown' }, { metadata: [] }]) {
    await assert.rejects(sdk.payments.create({ amount: '1', currency: 'USDC', ...extra }));
  }
  await assert.rejects(sdk.payments.get('../secrets'), /paymentId/);
});

test('refresh uses its owning client and emits completed/confirmed once with current data', async () => {
  let next = { ...data, status: 'completed', txHash: 'chain-tx', confirmedAt: 1000, uId: 'merchant' };
  const payment = new Payment(data, { _getPaymentData: async id => { assert.equal(id, data.paymentId); return next; } });
  const events = [];
  for (const event of ['status_change', 'completed', 'confirmed']) payment.on(event, value => events.push([event, value]));
  assert.equal(await payment.refresh(), payment);
  assert.deepEqual(events.map(([event]) => event), ['status_change', 'completed', 'confirmed']);
  assert.equal(events[1][1].txHash, 'chain-tx');
  assert.equal(payment.userId, 'merchant');
  assert.equal(payment.confirmedAt.getTime(), 1000);
  await payment.refresh();
  payment.startListening();
  assert.equal(events.length, 3);
  assert.equal(payment.listener, null);
  next = { ...data, status: 'cancelled' };
  await payment.refresh();
  assert.equal(payment.status, 'cancelled');
});

test('stopListening discards an in-flight poll and does not schedule another', async () => {
  let finish;
  let requests = 0;
  const payment = new Payment(data, { pollInterval: 1, _getPaymentData: () => { requests++; return new Promise(resolve => { finish = resolve; }); } });
  payment.startListening();
  payment.startListening();
  payment.stopListening();
  finish({ ...data, status: 'completed' });
  await tick();
  assert.equal(payment.status, 'pending');
  assert.equal(requests, 1);
  assert.equal(payment.listener, null);
});

test('authentication failure stops polling and reports the server error', async () => {
  const failure = Object.assign(new Error('Revoked'), { status: 403 });
  const payment = new Payment(data, { _getPaymentData: async () => { throw failure; } });
  const error = once(payment, 'error');
  payment.startListening();
  assert.equal((await error)[0], failure);
  assert.equal(payment._listening, false);
  assert.equal(payment.listener, null);
});

test('isExpired handles missing expiry and does not relabel completed payments', () => {
  assert.equal(new Payment({ ...data, expiresAt: null }).isExpired(), false);
  const payment = new Payment({ ...data, expiresAt: 1 });
  assert.equal(payment.isExpired(), true);
  assert.equal(payment.status, 'pending');
  assert.equal(new Payment({ ...data, status: 'completed', expiresAt: 1 }).isExpired(), false);
});

test('HTTP errors retain status, redirects are refused, and requests time out', async t => {
  let mode = 'error';
  let hits = 0;
  const server = createServer((req, res) => {
    hits++;
    assert.equal(req.headers.authorization, 'Bearer fixture');
    if (mode === 'timeout') return;
    if (mode === 'redirect') { res.writeHead(302, { Location: '/elsewhere' }); res.end(); return; }
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const sdk = new SkyzaiPay({ apiKey: 'fixture', baseURL: `http://127.0.0.1:${server.address().port}`, timeout: 100 });
  await assert.rejects(sdk.payments.get('pay-1'), error => error.status === 429 && /Rate limit/.test(error.message));
  mode = 'redirect';
  await assert.rejects(sdk.payments.get('pay-1'), /request failed/);
  assert.equal(hits, 2);
  mode = 'timeout';
  await assert.rejects(sdk.payments.get('pay-1'), /timed out/);
});

test('expiry grace performs a final get, reports server status, and stops without inventing expiry', async () => {
  let calls = 0;
  const payment = new Payment({ ...data, expiresAt: 1 }, {
    expiryGrace: 0, pollInterval: 10,
    _getPaymentData: async () => { calls++; return { ...data, expiresAt: 1 }; },
  });
  payment.on('expired', () => assert.fail('Must not invent a server state'));
  const stopped = once(payment, 'monitoring_stopped', { signal: AbortSignal.timeout(1000) });
  payment.startListening();
  assert.equal((await stopped)[0], payment);
  assert.equal(payment.status, 'pending');
  assert.equal(calls, 1);
  assert.equal(payment._listening, false);
  assert.equal(payment.listener, null);
});

test('expiry final request can report completion; an expired handler response stops immediately', async () => {
  for (const status of ['completed', 'expired']) {
    const payment = new Payment({ ...data, expiresAt: 1 }, {
      expiryGrace: 0,
      _getPaymentData: async () => ({ ...data, status, expiresAt: 1 }),
    });
    const result = once(payment, status, { signal: AbortSignal.timeout(1000) });
    payment.startListening();
    await result;
    assert.equal(payment.status, status);
    assert.equal(payment._listening, false);
  }
});

test('expiry final request failure reports the error and stops on the last known status', async () => {
  const payment = new Payment({ ...data, expiresAt: 1 }, {
    expiryGrace: 0,
    _getPaymentData: async () => { throw new Error('temporary outage'); },
  });
  const errors = [];
  payment.on('error', error => errors.push(error));
  // Avoid events.once's special rejection on an error event: both events are expected.
  const stopped = new Promise(resolve => payment.once('monitoring_stopped', resolve));
  payment.startListening();
  await stopped;
  assert.equal(errors[0].message, 'temporary outage');
  assert.equal(payment.status, 'pending');
  assert.equal(payment._listening, false);
});
