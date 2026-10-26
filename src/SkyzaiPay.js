// Merchant HTTP client with credential-safe errors shared by create, get, cancel and polling.
import Payment from './Payment.js';

const BASE_URL = 'https://us-central1-skyzai-16e1b.cloudfunctions.net';
// shortcut: HTTP handlers expose messages only; use server codes when the wire contract adds them.
const REFUSAL_CODES = new Map([
  ['401:Missing or invalid authorization header', 'API_KEY_INVALID'],
  ['401:Invalid API key', 'API_KEY_INVALID'],
  ['401:API key expired. Please generate a new one.', 'API_KEY_EXPIRED'],
  ['401:This API key was issued before revocation support and is no longer valid. Please generate a new API key.', 'API_KEY_REISSUE_REQUIRED'],
  ['403:This API key has been revoked. Please generate a new one.', 'API_KEY_REVOKED'],
  ['403:Business is not approved to accept payments', 'BUSINESS_NOT_APPROVED'],
  ['403:Account is flagged or blocked', 'ACCOUNT_BLOCKED'],
  ['404:Business not found', 'BUSINESS_NOT_FOUND'],
]);

export class SkyzaiPayError extends Error {
  constructor(message, status, code = 'HTTP_ERROR') {
    super(`Skyzai Pay: ${message}`);
    this.name = 'SkyzaiPayError';
    this.status = status;
    this.code = code;
  }
}

function merchantApiKey(value) {
  if (typeof value !== 'string' || !value.trim() || /[^\x20-\x7e]/.test(value)) {
    throw new Error('Skyzai Pay: a valid merchant API key is required');
  }
  return value.trim();
}

function paymentId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
    throw new Error('Skyzai Pay: a valid paymentId is required');
  }
  return value;
}

class SkyzaiPay {
  #apiKey;
  constructor(config = {}) {
    const apiKey = merchantApiKey(config?.apiKey);
    // Only Skyzai and an explicitly configured local test server may receive the key.
    let endpoint;
    try { endpoint = new URL(config.baseURL || BASE_URL); }
    catch { throw new Error('Skyzai Pay: invalid baseURL'); }
    const local = endpoint.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if ((!local && endpoint.origin !== BASE_URL) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error('Skyzai Pay: baseURL must use the Skyzai backend or a loopback test server');
    }
    this.#apiKey = apiKey;
    this.baseURL = endpoint.href.replace(/\/$/, '');
    this.debug = config.debug === true;
    this.pollInterval = config.pollInterval ?? 3000;
    this.timeout = config.timeout ?? 30000;
    this.expiryGrace = config.expiryGrace ?? 120000;
    for (const name of ['pollInterval', 'timeout']) {
      if (!Number.isInteger(this[name]) || this[name] <= 0 || this[name] > 2147483647) {
        throw new Error(`Skyzai Pay: ${name} must be a positive timer interval in milliseconds`);
      }
    }
    if (!Number.isInteger(this.expiryGrace) || this.expiryGrace < 0 || this.expiryGrace > 2147483647) {
      throw new Error('Skyzai Pay: expiryGrace must be a non-negative timer interval in milliseconds');
    }
    this.payments = {
      create: this.createPayment.bind(this),
      get: this.getPayment.bind(this),
      cancel: this.cancelPayment.bind(this),
    };
  }

  async _request(path, method = 'GET', body) {
    const apiKey = merchantApiKey(this.#apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let response;
    let data;
    try {
      response = await fetch(`${this.baseURL}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      data = await response.json();
    } catch {
      // Fetch errors may contain Authorization, including in non-enumerable fields.
      throw new Error(`Skyzai Pay: ${controller.signal.aborted ? 'request timed out' : 'request failed'}`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const message = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : response.statusText;
      const code = REFUSAL_CODES.get(`${response.status}:${message}`) ?? 'HTTP_ERROR';
      throw new SkyzaiPayError(message.replaceAll(apiKey, '[redacted]'), response.status, code);
    }
    if (this.debug) console.log('[Skyzai Pay]', method, path.split('?')[0], response.status);
    return data;
  }

  async createPayment(data = {}) {
    if (!data || typeof data !== 'object') throw new Error('Skyzai Pay: payment data is required');
    const { currency, metadata = {}, network = 'mainnet' } = data;
    if (!['USDC', 'USDT', 'USD'].includes(currency)) {
      throw new Error('Skyzai Pay: currency must be USDC, USDT, or USD');
    }
    const amount = typeof data.amount === 'number' || typeof data.amount === 'string' ? String(data.amount) : '';
    if (amount.length > 100 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(amount) || !(Number(amount) > 0) || !Number.isFinite(Number(amount))) {
      throw new Error('Skyzai Pay: amount must be a positive decimal in whole token units');
    }
    if (currency === 'USDC' || currency === 'USD') {
      const [whole, fraction = ''] = amount.split('.');
      if (fraction.length > 6) throw new Error('Skyzai Pay: USDC amounts require at most 6 decimals');
      const units = BigInt(whole + fraction.padEnd(6, '0'));
      // The server verifies with Number(amount) * 10**6; reject any precision loss.
      const serverUnits = Math.round(Number(amount) * 1e6);
      if (!Number.isSafeInteger(serverUnits) || BigInt(serverUnits) !== units) {
        throw new Error('Skyzai Pay: USDC amount cannot be represented safely in smallest units');
      }
    }
    if (!['mainnet', 'testnet'].includes(network)) throw new Error('Skyzai Pay: network must be mainnet or testnet');
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Skyzai Pay: metadata must be an object');
    const result = await this._request('createPayment', 'POST', { amount, currency, network, metadata });
    return new Payment(result, this);
  }

  async _getPaymentData(id) {
    return this._request(`getPayment?id=${encodeURIComponent(paymentId(id))}`);
  }

  async getPayment(id) {
    return new Payment(await this._getPaymentData(id), this);
  }

  async cancelPayment(id) {
    return new Payment(await this._request('cancelPayment', 'POST', { paymentId: paymentId(id) }), this);
  }
}

export default SkyzaiPay;
