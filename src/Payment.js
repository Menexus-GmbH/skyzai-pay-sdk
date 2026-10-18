import EventEmitter from 'events';

const TERMINAL = new Set(['completed', 'confirmed', 'expired', 'failed', 'cancelled']);

class Payment extends EventEmitter {
  constructor(data, client) {
    super();
    Object.defineProperty(this, 'client', { value: client });
    this.listener = null;
    this._generation = 0;
    this._requestId = 0;
    this._listening = false;
    this._notifiedStatus = null;
    this._update(data, false);
  }

  _update(data, notify = true) {
    if (TERMINAL.has(this.status) && !TERMINAL.has(data.status)) return;
    const oldStatus = this.status;
    this.id = data.paymentId || data.id;
    this.paymentId = this.id;
    this.status = data.status;
    this.amount = data.amount;
    this.currency = data.currency;
    this.userId = data.userId ?? data.uId ?? null;
    this.userEmail = data.userEmail ?? null;
    this.userName = data.userName ?? null;
    this.qrCode = data.qrCode || data.deepLink;
    this.deepLink = data.deepLink;
    this.destinations = data.destinations || {};
    this.metadata = data.metadata || {};
    this.txHash = data.txHash || null;
    for (const field of ['createdAt', 'expiresAt', 'confirmedAt', 'updatedAt']) {
      this[field] = data[field] == null ? null : new Date(data[field]);
    }
    if (notify && oldStatus !== this.status) this.emit('status_change', this.status);
    if (notify) this._notifyTerminal();
  }

  _notifyTerminal() {
    if (!TERMINAL.has(this.status)) return;
    this.stopListening();
    if (this._notifiedStatus === this.status) return;
    this._notifiedStatus = this.status;
    this.emit(this.status, this);
    // Existing integrations may keep their confirmed callback; status stays "completed".
    if (this.status === 'completed') this.emit('confirmed', this);
  }

  startListening() {
    if (this._listening) return;
    if (TERMINAL.has(this.status)) { this._notifyTerminal(); return; }
    this._listening = true;
    const generation = ++this._generation;
    const deadline = () => {
      const expires = this.expiresAt?.getTime();
      return Number.isFinite(expires) ? expires + (this.client.expiryGrace ?? 120000) : Infinity;
    };
    const poll = async () => {
      const finalPoll = Date.now() >= deadline();
      try {
        await this.refresh();
      } catch (error) {
        if (generation !== this._generation) return;
        // A revoked/expired key or deleted payment cannot recover by polling.
        if ([400, 401, 403, 404].includes(error.status)) this.stopListening();
        this.emit('error', error);
      } finally {
        if (this._listening && generation === this._generation) {
          if (finalPoll) {
            this.stopListening();
            this.emit('monitoring_stopped', this);
          } else {
            const delay = Math.min(this.client.pollInterval, Math.max(0, deadline() - Date.now()));
            this.listener = setTimeout(poll, delay);
          }
        }
      }
    };
    void poll();
  }

  stopListening() {
    this._listening = false;
    ++this._generation;
    clearTimeout(this.listener);
    this.listener = null;
  }

  getStatus() { return this.status; }
  getQRCode() { return this.qrCode; }
  getDeepLink() { return this.deepLink; }
  isExpired() { return this.status === 'expired' || (this.status === 'pending' && this.expiresAt !== null && Date.now() >= this.expiresAt.getTime()); }

  async refresh() {
    const generation = this._generation;
    const requestId = ++this._requestId;
    const isCurrent = () => generation === this._generation && requestId === this._requestId;
    let data;
    try {
      data = await this.client._getPaymentData(this.id);
    } catch (error) {
      if (isCurrent()) throw error;
      return this;
    }
    if (isCurrent()) this._update(data);
    return this;
  }
}

export default Payment;
