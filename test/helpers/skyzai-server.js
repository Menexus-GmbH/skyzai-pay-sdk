import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import { createServer } from 'node:http';

// Load the actual TypeScript handlers without initializing any cloud SDK.
export async function startSkyzaiServer() {
  if (!process.env.SKYZAI_APP_ROOT) throw new Error('Set SKYZAI_APP_ROOT to a local skyzai_app checkout');
  const root = resolve(process.env.SKYZAI_APP_ROOT, 'functions');
  const requireServer = createRequire(resolve(root, 'package.json'));
  const ts = requireServer('typescript');
  const jwt = requireServer('jsonwebtoken');
  const cache = new Map();
  const calls = [];
  const logs = [];
  let db;
  let clockOverride;
  const now = () => clockOverride ?? Date.now();
  let mirrorTransactions = null;
  const secret = 'local-test-fixture-only';
  class HttpsError extends Error {
    constructor(code, message, details) { super(message); this.code = code; this.details = details; }
  }
  const cloud = {
    admin: {
      firestore: () => db,
    },
    functions: { logger: { error: (...args) => logs.push(args), info: () => {}, warn: () => {} } },
  };
  cloud.admin.firestore.FieldValue = { serverTimestamp: now };
  function load(file) {
    file = resolve(file);
    if (!existsSync(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    if (!file.startsWith(`${root}/src/`) && file !== `${root}/test/firestoreFake.ts`) {
      throw new Error(`Disallowed server import: ${file}`);
    }
    if (file === `${root}/src/firebaseAdmin.ts`) return cloud;
    if (file === `${root}/src/config/jwtSecret.ts`) return { JWT_SECRET: { name: 'JWT_SECRET', value: () => secret } };
    if (file === `${root}/src/utils/hardenedFetch.ts`) return {
      hardenedFetchJson: () => { throw new Error('Network access forbidden in local payment tests'); },
    };
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: file,
    }).outputText;
    const localRequire = name => {
      if (name.startsWith('.')) return load(resolve(dirname(file), name));
      if (name === 'firebase-functions/v2/https') return {
        onRequest: (options, fn) => Object.assign(fn, { options }), onCall: (_options, fn) => fn, HttpsError,
      };
      if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: now } };
      if (name === 'jsonwebtoken') return jwt;
      if (name === 'node:crypto') return requireServer(name);
      throw new Error(`Unfaked external dependency: ${name} in ${file}`);
    };
    const localConsole = { log: (...args) => logs.push(args), error: (...args) => logs.push(args), warn: (...args) => logs.push(args) };
    runInThisContext(`(function(require,module,exports,console,process){${code}\n})`, { filename: file })(
      localRequire, module, module.exports, localConsole, { env: { GCLOUD_PROJECT: 'demo-skyzai' } },
    );
    return module.exports;
  }
  const { FakeDb } = load(`${root}/test/firestoreFake.ts`);
  db = new FakeDb();
  db.docs.set('Users/merchant', { uId: 'merchant', userEmail: 'merchant@example.invalid', userName: 'Local merchant', walletAddress: '0.0.9000', accountAddress: '0.0.9000', kybStatus: 'approved', admins: [{ uId: 'admin-user', status: 'accepted' }] });
  db.docs.set('Users/admin-user', { administration: ['merchant'] });
  const { createGenerateAPIKeyHandler } = load(`${root}/src/admin/generateAPIKey.ts`);
  const generateKey = createGenerateAPIKeyHandler({ db: () => db, verifyIdToken: async () => ({ uid: 'admin-user' }) });
  let generated;
  let keyStatus;
  const keyResponse = {
    set() { return this; }, status(value) { keyStatus = value; return this; },
    json(value) { generated = value; },
  };
  await generateKey({ method: 'POST', headers: { authorization: 'Bearer local-admin-session' }, body: { businessId: 'merchant' } }, keyResponse);
  if (keyStatus !== 200) throw new Error(`generateAPIKey failed: ${JSON.stringify(generated)}`);
  const apiKey = generated.apiKey;
  const keyId = jwt.decode(apiKey).keyId;
  const routes = Object.fromEntries(['createPayment', 'getPayment', 'cancelPayment'].map(name => [
    `/${name}`, load(`${root}/src/payment/${name}.ts`)[name],
  ]));
  const { createCompleteSkyzaiPaymentHandler } = load(`${root}/src/payment/completeSkyzaiPayment.ts`);
  const complete = createCompleteSkyzaiPaymentHandler({
    db: () => db, now,
    mirror: { getTransaction: async () => mirrorTransactions, getTokenDecimals: async () => 6 },
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      req.query = Object.fromEntries(url.searchParams);
      calls.push({ path: url.pathname, method: req.method, body: req.body });
      res.set = (name, value) => { res.setHeader(name, value); return res; };
      res.status = status => { res.statusCode = status; return res; };
      res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
      res.send = data => res.end(data);
      if (routes[url.pathname]) await routes[url.pathname](req, res);
      else res.status(404).json({ error: 'Unknown local route' });
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return {
    baseURL: `http://127.0.0.1:${server.address().port}`, db, calls, logs, apiKey, keyId,
    endpointOptions: Object.fromEntries(Object.entries(routes).map(([path, handler]) => [path, handler.options])),
    complete,
    setNow: value => { clockOverride = value; },
    setMirror: value => { mirrorTransactions = value; },
    close: () => new Promise(resolveClose => { server.closeAllConnections(); server.close(resolveClose); }),
  };
}

export function transfer(paymentId, amount = 10_123_456, overrides = {}) {
  const now = Date.now();
  return {
    result: 'SUCCESS',
    memo_base64: Buffer.from(`Payment: ${paymentId}`).toString('base64'),
    consensus_timestamp: `${Math.floor(now / 1000)}.${String(now % 1000).padStart(3, '0')}000000`,
    token_transfers: [
      { token_id: '0.0.456858', account: '0.0.9000', amount },
      { token_id: '0.0.456858', account: '0.0.7001', amount: -amount },
    ],
    ...overrides,
  };
}
