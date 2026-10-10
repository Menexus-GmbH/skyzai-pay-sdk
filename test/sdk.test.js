import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import axios from 'axios';
import AureusPay, { Payment } from '../src/index.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const full = (extra = {}) => ({ paymentId: 'p1', status: 'pending', amount: '10.00', currency: 'USDC',
  userId: 'merchant', metadata: { orderId: 'order1' }, createdAt: 1000, updatedAt: 2000,
  expiresAt: 9000, qrCode: 'skyzai://pay?id=p1', deepLink: 'skyzai://pay?id=p1', ...extra });

async function fake(t, handler, config = { apiKey: 'merchant-key' }) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = { method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null };
    requests.push(request);
    try {
      await handler(request, res, requests);
    } catch (error) {
      res.writeHead(500); res.end(JSON.stringify({ error: error.message }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const sdk = new AureusPay(config);
  // Route only the test transport to a local fixture; production URL validation stays enabled.
  sdk.apiClient.defaults.adapter = request => axios.getAdapter('http')({ ...request,
    baseURL: `http://127.0.0.1:${server.address().port}`, httpsAgent: undefined });
  return { sdk, requests };
}
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };

for (const backend of ['aureus', 'skyzai']) {
  test(`${backend}: auth, partial create hydration, get, cancel and order metadata`, async t => {
    const config = backend === 'aureus' ? { apiKey: 'merchant-key' } : { backend, getIdToken: async () => 'firebase-token' };
    const { sdk, requests } = await fake(t, (req, res) => {
      if (req.url === '/createPayment') json(res, { paymentId: 'p1', status: 'pending', qrCode: full().qrCode }, 201);
      else json(res, full({ status: req.url === '/cancelPayment' ? 'cancelled' : 'pending' }));
    }, config);
    assert.match(sdk.baseURL, backend === 'aureus' ? /aureus-money/ : /skyzai-16e1b/);
    const payment = await sdk.payments.create({ amount: '10.00', currency: 'USDC', orderId: 'order1', metadata: { label: 'x', orderId: 'old' } });
    assert.deepEqual(requests[0].body, { amount: '10.00', currency: 'USDC', metadata: { label: 'x', orderId: 'order1' } });
    assert.equal(requests.length, 2);
    assert.equal(payment.apiClient, sdk.apiClient);
    assert.equal(payment.uId, 'merchant'); assert.equal(payment.userId, 'merchant');
    assert.equal(payment.createdAt.getTime(), 1000); assert.equal(payment.updatedAt.getTime(), 2000);
    assert.equal(payment.orderId, 'order1'); assert.equal(payment.qrCode, payment.qrUri);
    assert.equal(payment.getQRCode(), full().qrCode); assert.equal(payment.getDeepLink(), full().deepLink);
    await payment.refresh();
    assert.equal((await sdk.payments.get('p1')).id, 'p1');
    assert.equal((await sdk.payments.cancel('p1')).status, 'cancelled');
    assert.deepEqual(requests.at(-1).body, { paymentId: 'p1' });
    for (const request of requests) assert.equal(request.auth, `Bearer ${backend === 'aureus' ? 'merchant-key' : 'firebase-token'}`);
  });
}

test('complete create response requires no refresh', async t => {
  const { sdk, requests } = await fake(t, (req, res) => json(res, full()));
  await sdk.payments.create({ amount: 10, currency: 'USD' });
  assert.equal(requests.length, 1);
});

test('auth and configuration validation', () => {
  for (const config of [undefined, {}, { apiKey: '' }, { apiKey: 2 }, { backend: 'other', apiKey: 'x' },
    { backend: 'skyzai', apiKey: 'x' }, { backend: 'skyzai', getIdToken: 'x' },
    { backend: 'skyzai', getIdToken: async () => 'x', apiKey: 'x' }, { apiKey: 'x', getIdToken: async () => 'x' }]) {
    assert.throws(() => new AureusPay(config), /backend|apiKey|getIdToken/);
  }
  assert.equal(new AureusPay({ apiKey: 'x', baseURL: 'https://merchant.example/payment/' }).baseURL, 'https://merchant.example/payment');
  for (const baseURL of ['http://example.com', 'file:///etc/passwd', 'gopher://host', 'https://user:password@example.com', 'https://example.com/?token=x']) {
    assert.throws(() => new AureusPay({ apiKey: 'x', baseURL }));
  }
});

test('Skyzai refreshes token once on 401', async t => {
  let tokens = 0;
  const { sdk, requests } = await fake(t, (req, res, all) => all.length === 1 ? json(res, { error: 'expired' }, 401) : json(res, full()),
    { backend: 'skyzai', getIdToken: async () => `token-${++tokens}` });
  await sdk.payments.get('p1');
  assert.deepEqual(requests.map(r => r.auth), ['Bearer token-1', 'Bearer token-2']);
});

for (const backend of ['aureus', 'skyzai']) {
  test(`${backend}: repeated 401 is bounded`, async t => {
    const { sdk, requests } = await fake(t, (req, res) => json(res, { error: 'invalid auth' }, 401),
      backend === 'aureus' ? { apiKey: 'x' } : { backend, getIdToken: async () => 'x' });
    await assert.rejects(sdk.payments.get('p1'), /invalid auth/);
    assert.equal(requests.length, backend === 'aureus' ? 1 : 2);
  });
}

test('token provider rejection and empty token do not send a request', async t => {
  for (const getIdToken of [async () => '', async () => { throw new Error('refresh unavailable'); }]) {
    const { sdk, requests } = await fake(t, (req, res) => json(res, full()), { backend: 'skyzai', getIdToken });
    await assert.rejects(sdk.payments.get('p1'), /non-empty|refresh unavailable/);
    assert.equal(requests.length, 0);
  }
});

for (const status of ['completed', 'confirmed', 'expired', 'cancelled', 'failed']) {
  test(`polling stops on ${status} without overlap and emits once`, async t => {
    let active = 0; let max = 0;
    const { sdk, requests } = await fake(t, async (req, res, all) => {
      active++; max = Math.max(active, max);
      await delay(20); active--;
      json(res, full({ status: all.length === 1 ? 'pending' : status, txHash: 'hash' }));
    });
    const payment = new Payment(full(), sdk.apiClient);
    t.after(() => payment.stopListening());
    const counts = { confirmed: 0, paid: 0, [status]: 0 };
    for (const name of Object.keys(counts)) payment.on(name, () => counts[name]++);
    const changes = []; payment.on('status_change', s => changes.push(s));
    const event = ['completed', 'confirmed'].includes(status) ? 'paid' : status;
    const terminal = once(payment, event);
    payment.startListening(undefined, 1); payment.startListening(undefined, 1);
    await terminal; await delay(30);
    assert.equal(max, 1); assert.equal(requests.length, 2); assert.equal(payment.pollingInterval, null);
    assert.deepEqual(changes, [status]);
    payment.startListening();
    if (event === 'paid') { assert.equal(counts.confirmed, 1); assert.equal(counts.paid, 1); }
    else assert.equal(counts[status], 1);
  });
  test(`already ${status} emits terminal event without polling`, () => {
    let requests = 0;
    const payment = new Payment(full({ status }), { get: () => { requests++; } });
    let count = 0;
    payment.on(['completed', 'confirmed'].includes(status) ? 'paid' : status, () => count++);
    payment.startListening(); payment.startListening();
    assert.equal(count, 1); assert.equal(requests, 0); assert.equal(payment.pollingInterval, null);
  });
}

test('stop during an in-flight poll prevents late events', async t => {
  let arrived;
  const started = new Promise(resolve => { arrived = resolve; });
  const { sdk, requests } = await fake(t, async (req, res) => { arrived(); await delay(30); json(res, full({ status: 'completed' })); });
  const payment = new Payment(full(), sdk.apiClient);
  let paid = 0; payment.on('paid', () => paid++);
  payment.startListening(undefined, 0);
  await started; payment.stopListening(); await delay(60);
  assert.equal(paid, 0); assert.equal(requests.length, 1); assert.equal(payment.pollingInterval, null);
});

test('polling and refresh error paths', async t => {
  const { sdk } = await fake(t, (req, res) => json(res, { error: 'not found' }, 404));
  const payment = new Payment(full(), sdk.apiClient);
  const error = new Promise(resolve => payment.once('error', resolve));
  payment.startListening(undefined, 0);
  assert.match((await error).message, /404/); assert.equal(payment.pollingInterval, null);
  await assert.rejects(payment.refresh(), /Failed to refresh payment/);
  await assert.rejects(sdk.payments.create({ amount: 10, currency: 'USDC' }), /Payment creation failed: not found/);
  await assert.rejects(sdk.payments.cancel('p1'), /Cancel payment failed: not found/);
});

test('invalid amounts, currencies, metadata and identifiers', async t => {
  const { sdk, requests } = await fake(t, (req, res) => json(res, full()));
  for (const amount of [undefined, 0, -1, 'NaN', 'Infinity', '1e3', '0.00', {}, '1.2.3']) {
    await assert.rejects(sdk.payments.create({ amount, currency: 'USDC' }), /positive decimal/);
  }
  await assert.rejects(sdk.payments.create({ amount: 1, currency: 'BTC' }), /currency/);
  await assert.rejects(sdk.payments.create({ amount: 1, currency: 'USDC', metadata: [] }), /metadata/);
  await assert.rejects(sdk.payments.get(), /paymentId/); await assert.rejects(sdk.payments.cancel(), /paymentId/);
  assert.equal(requests.length, 0);
  assert.throws(() => new Payment({}), /missing/);
  const detached = new Payment(full());
  assert.throws(() => detached.startListening(), /API client/);
  await assert.rejects(detached.refresh(), /API client/);
  assert.throws(() => detached.startListening({}, -1), /intervalMs/);
});

test('identity, epoch timestamps and raw backend status normalization', () => {
  const payment = new Payment(full({ uId: 'uid', userId: undefined, createdAt: 0, confirmedAt: 0, status: 'completed' }));
  assert.equal(payment.uId, 'uid'); assert.equal(payment.userId, 'uid');
  assert.equal(payment.createdAt.getTime(), 0); assert.equal(payment.confirmedAt.getTime(), 0);
  assert.equal(payment.getStatus(), 'completed'); assert.equal(payment.isExpired(), true);
  assert.equal(new Payment({ id: 'p' }).isExpired(), false);
});

test('baseURL must be https, except http://localhost for the emulator', () => {
  for (const bad of ['http://example.com', 'ftp://example.com', 'https://user:pw@example.com', 'https://example.com/?q=1']) {
    assert.throws(() => new AureusPay({ apiKey: 'x', baseURL: bad }), /baseURL/, bad);
  }
  assert.equal(new AureusPay({ apiKey: 'x', baseURL: 'http://127.0.0.1:5001/demo/us-central1' }).baseURL, 'http://127.0.0.1:5001/demo/us-central1');
  assert.equal(new AureusPay({ apiKey: 'x', baseURL: 'https://pay.example.com/' }).baseURL, 'https://pay.example.com');
});

test('redirect to private address is not followed', async t => {
  const { sdk, requests } = await fake(t, (req, res) => { res.writeHead(302, { Location: 'http://169.254.169.254/' }); res.end(); });
  await assert.rejects(sdk.payments.get('p1'), /Found/); assert.equal(requests.length, 1);
});

test('oversized response is aborted', async t => {
  const { sdk } = await fake(t, (req, res) => res.end('x'.repeat(1024 * 1024 + 1)));
  await assert.rejects(sdk.payments.get('p1'), /maxContentLength/);
});

test('dashboard completion runs once with the SDK paid normalization', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = (await readFile(new URL('../examples/aureus-pay-dash/src/services/aureusService.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '');
  const module = await import(`data:text/javascript;base64,${Buffer.from('const fetchTransactionData = async () => null;\n' + source).toString('base64')}`);
  const apiClient = { get: async () => ({ data: full({ status: 'completed' }) }) };
  const payment = new Payment(full(), apiClient);
  const listen = payment.startListening.bind(payment);
  payment.startListening = client => listen(client, 0);
  const paid = once(payment, 'paid');
  let completed = 0;
  module.setupPaymentListeners(payment, { apiClient }, {
    onStatusChange: () => {}, onConfirmed: () => completed++, onExpired: () => {}, onCancelled: () => {}
  }, () => {});
  await paid;
  await delay(0);
  assert.equal(completed, 1);
});

test('network failures preserve actionable error context', async t => {
  const { sdk } = await fake(t, (req, res) => res.destroy());
  await assert.rejects(sdk.payments.get('p1'), /socket hang up/);
  await assert.rejects(sdk.payments.create({ amount: 1, currency: 'USDC' }), /Payment creation failed/);
  await assert.rejects(sdk.payments.cancel('p1'), /Cancel payment failed/);
});

test('stop and restart ignore the previous in-flight response without overlap', async t => {
  let started;
  const first = new Promise(resolve => { started = resolve; });
  let active = 0; let maximum = 0;
  const { sdk, requests } = await fake(t, async (req, res, all) => {
    const index = all.length;
    active++; maximum = Math.max(maximum, active);
    if (index === 1) started();
    await delay(20); active--;
    json(res, full({ status: index === 1 ? 'completed' : 'expired' }));
  });
  const payment = new Payment(full(), sdk.apiClient);
  t.after(() => payment.stopListening());
  let paid = 0; payment.on('paid', () => paid++);
  payment.startListening(undefined, 0); await first;
  payment.stopListening();
  const expired = once(payment, 'expired');
  payment.startListening(undefined, 0);
  await expired;
  assert.equal(paid, 0); assert.equal(maximum, 1); assert.equal(requests.length, 2);
});
