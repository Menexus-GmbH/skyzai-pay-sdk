import axios from 'axios';
import Payment from './Payment.js';

// HTTPS only, except plain HTTP to localhost for the Firebase emulator.
function validateBaseURL(raw) {
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error('baseURL must be an HTTPS URL (or http://localhost for the emulator) without credentials, query or fragment');
  }
  return url.href.replace(/\/$/, '');
}

const BASE_URLS = {
  aureus: 'https://us-central1-aureus-money.cloudfunctions.net',
  skyzai: 'https://us-central1-skyzai-16e1b.cloudfunctions.net'
};

class AureusPay {
  constructor(config = {}) {
    this.backend = config.backend ?? 'aureus';
    if (!BASE_URLS[this.backend]) throw new Error('backend must be aureus or skyzai');
    if (this.backend === 'aureus' && (typeof config.apiKey !== 'string' || !config.apiKey.trim() || config.getIdToken !== undefined)) {
      throw new Error('aureus requires apiKey and does not accept getIdToken');
    }
    if (this.backend === 'skyzai' && (typeof config.getIdToken !== 'function' || config.apiKey !== undefined)) {
      throw new Error('skyzai requires getIdToken and does not accept apiKey');
    }
    this.apiKey = config.apiKey;
    this.baseURL = validateBaseURL(config.baseURL ?? BASE_URLS[this.backend]);
    this.debug = config.debug || false;
    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
      maxRedirects: 0,
      maxContentLength: 1024 * 1024,
      maxBodyLength: 1024 * 1024,
      proxy: false
    });
    this.apiClient.interceptors.request.use(async request => {
      const token = this.backend === 'aureus' ? this.apiKey : await config.getIdToken();
      if (typeof token !== 'string' || !token.trim()) throw new Error('getIdToken must return a non-empty token');
      request.headers.Authorization = `Bearer ${token}`;
      return request;
    });
    this.apiClient.interceptors.response.use(response => response, async error => {
      if (this.backend === 'skyzai' && error.response?.status === 401 && !error.config._authRetried) {
        error.config._authRetried = true;
        return this.apiClient.request(error.config);
      }
      throw error;
    });
    this.payments = {
      create: this.createPayment.bind(this),
      get: this.getPayment.bind(this),
      cancel: this.cancelPayment.bind(this)
    };
  }

  async createPayment(data = {}) {
    if (!/^(?:\d+)(?:\.\d+)?$/.test(String(data.amount)) || !Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0) {
      throw new Error('amount must be a positive decimal');
    }
    const validCurrencies = ['USDC', 'USDT', 'USD'];
    if (!validCurrencies.includes(data.currency)) throw new Error(`currency must be one of: ${validCurrencies.join(', ')}`);
    if (data.metadata !== undefined && (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata))) {
      throw new Error('metadata must be an object');
    }
    const metadata = { ...data.metadata };
    if (data.orderId !== undefined) metadata.orderId = data.orderId;
    try {
      const response = await this.apiClient.post('/createPayment', {
        amount: String(data.amount), currency: data.currency, metadata
      });
      const payment = new Payment(response.data, this.apiClient);
      if (['metadata', 'createdAt', 'updatedAt'].some(key => response.data[key] === undefined) || !(response.data.uId ?? response.data.userId)) {
        await payment.refresh();
      }
      return payment;
    } catch (error) {
      throw this._error('Payment creation failed', error);
    }
  }

  async getPayment(paymentId) {
    if (!paymentId) throw new Error('paymentId is required');
    try {
      const response = await this.apiClient.get('/getPayment', { params: { id: paymentId } });
      return new Payment(response.data, this.apiClient);
    } catch (error) {
      throw this._error('Get payment failed', error);
    }
  }

  async cancelPayment(paymentId) {
    if (!paymentId) throw new Error('paymentId is required');
    try {
      const response = await this.apiClient.post('/cancelPayment', { paymentId });
      return new Payment(response.data, this.apiClient);
    } catch (error) {
      throw this._error('Cancel payment failed', error);
    }
  }

  _error(operation, error) {
    const message = error.response?.data?.error || error.response?.data?.message || error.response?.statusText || error.message;
    return new Error(`${operation}: ${message}`, { cause: error });
  }
}

export default AureusPay;
