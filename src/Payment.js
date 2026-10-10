import EventEmitter from 'events';

const TERMINAL = new Set(['completed', 'confirmed', 'expired', 'failed', 'cancelled']);
const PAID = new Set(['completed', 'confirmed']);

class Payment extends EventEmitter {
  constructor(data, apiClient = null) {
    super();
    this.apiClient = apiClient;
    this.pollingInterval = null;
    this._listening = false;
    this._inFlight = false;
    this._generation = 0;
    this._terminalEmitted = false;
    this._update(data);
    if (!this.id) throw new Error('Payment response is missing paymentId or id');
  }

  _update(data) {
    this._data = { ...this._data, ...data };
    const value = this._data;
    this.id = this.paymentId = value.paymentId || value.id;
    this.status = value.status;
    this.amount = value.amount;
    this.currency = value.currency ?? value.tokenSymbol;
    this.uId = this.userId = value.uId ?? value.userId;
    this.userEmail = value.userEmail ?? null;
    this.userName = value.userName ?? null;
    this.qrCode = this.qrUri = value.qrCode || value.qrUri || value.deepLink;
    this.deepLink = value.deepLink;
    this.destinations = value.destinations ?? {};
    this.metadata = value.metadata ?? {};
    this.orderId = this.metadata.orderId;
    this.txHash = value.txHash ?? null;
    for (const key of ['createdAt', 'expiresAt', 'confirmedAt', 'updatedAt']) {
      this[key] = value[key] == null ? null : new Date(value[key]);
    }
  }

  startListening(apiClient = this.apiClient, intervalMs = 3000) {
    if (!apiClient) throw new Error('API client is required for startListening');
    if (!Number.isFinite(intervalMs) || intervalMs < 0) throw new Error('intervalMs must be a non-negative number');
    if (this._listening) return;
    this.apiClient = apiClient;
    this._listening = true;
    this._generation++;
    if (this._emitTerminal()) return;
    this._poll = async () => {
      this.pollingInterval = null;
      if (!this._listening || this._inFlight) return;
      this._inFlight = true;
      const generation = this._generation;
      try {
        const response = await this.apiClient.get('/getPayment', { params: { id: this.id } });
        if (!this._listening || generation !== this._generation) return;
        const oldStatus = this.status;
        this._update(response.data);
        if (oldStatus !== this.status) this.emit('status_change', this.status);
        this._emitTerminal();
      } catch (error) {
        if (generation === this._generation) {
          this.stopListening();
          this.emit('error', error);
        }
      } finally {
        this._inFlight = false;
        if (this._listening) this.pollingInterval = setTimeout(this._poll, intervalMs);
      }
    };
    this.pollingInterval = setTimeout(this._poll, intervalMs);
  }

  _emitTerminal() {
    if (!TERMINAL.has(this.status)) return false;
    this.stopListening();
    if (!this._terminalEmitted) {
      this._terminalEmitted = true;
      if (PAID.has(this.status)) {
        this.emit('confirmed', this._data);
        this.emit('paid', this._data);
      } else {
        this.emit(this.status, this._data);
      }
    }
    return true;
  }

  stopListening() {
    this._generation++;
    this._listening = false;
    clearTimeout(this.pollingInterval);
    this.pollingInterval = null;
  }

  getStatus() { return this.status; }
  getQRCode() { return this.qrCode; }
  getDeepLink() { return this.deepLink; }
  isExpired() { return this.expiresAt !== null && Date.now() > this.expiresAt.getTime(); }

  async refresh(apiClient = this.apiClient) {
    if (!apiClient) throw new Error('API client is required for refresh');
    try {
      const response = await apiClient.get('/getPayment', { params: { id: this.id } });
      this._update(response.data);
      if (this._listening) this._emitTerminal();
      return this;
    } catch (error) {
      throw new Error(`Failed to refresh payment: ${error.message}`, { cause: error });
    }
  }
}

export default Payment;
