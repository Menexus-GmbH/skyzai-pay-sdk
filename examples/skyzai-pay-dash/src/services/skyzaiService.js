import SkyzaiPay from 'skyzai-pay';

export async function initializeSkyzai(apiKey, addLog) {
  const instance = new SkyzaiPay({ apiKey });
  const businessData = {
    businessName: 'Skyzai Pay',
    chains: [{ id: 'hedera-hts', name: 'Hedera mainnet', tokens: ['USDC'] }],
  };
  addLog('info', 'Skyzai Pay configured. The server validates the key on the first request.');
  return { instance, businessData };
}

export async function createPayment(terminal, product, _selectedChains, addLog) {
  const payment = await terminal.payments.create({
    amount: product.price.toString(), currency: 'USDC', network: 'mainnet',
    metadata: { product: product.name, productId: product.id },
  });
  addLog('success', `Payment created: ${payment.id}`);
  return payment;
}

export function setupPaymentListeners(payment, callbacks, addLog) {
  payment.on('status_change', status => callbacks.onStatusChange?.(status));
  payment.on('confirmed', () => callbacks.onConfirmed?.(payment));
  payment.on('expired', () => callbacks.onExpired?.());
  payment.on('failed', () => callbacks.onFailed?.());
  payment.on('cancelled', () => callbacks.onCancelled?.());
  payment.on('monitoring_stopped', final => callbacks.onMonitoringStopped?.(final));
  payment.on('error', error => {
    addLog('error', error.message);
    callbacks.onError?.(error);
  });
  payment.startListening();
}

export function stopPaymentListeners(payment) {
  payment?.stopListening();
}
