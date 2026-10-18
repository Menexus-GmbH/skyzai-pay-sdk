import React, { useState, useEffect } from 'react';
import { ArrowLeft, QrCode, Clock } from 'lucide-react';
import QRCode from 'react-qr-code';
import { useCart } from '../context/useCart';
import { useSettings } from '../context/useSettings';
import { createPayment, setupPaymentListeners, stopPaymentListeners } from '../services/skyzaiService';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import SuccessModal from '../components/SuccessModal';
import Receipt from '../components/Receipt';

const CheckoutScreen = ({ onBack }) => {
  const { cartItems, getCartTotal, clearCart } = useCart();
  const { terminal, selectedChains, businessInfo } = useSettings();
  const [activePayment, setActivePayment] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [error, setError] = useState('');
  const total = getCartTotal().toFixed(2);
  const product = { price: total, currency: 'USDC', name: `Order (${cartItems.length} items)` };

  useEffect(() => () => stopPaymentListeners(activePayment), [activePayment]);

  const handleCreatePayment = async () => {
    if (!terminal || !cartItems.length) return;
    setIsCreating(true);
    setError('');
    try {
      const payment = await createPayment(terminal, { ...product, id: `order-${Date.now()}` }, selectedChains, () => {});
      setActivePayment(payment);
      setPaymentStatus(payment.status);
      setupPaymentListeners(payment, {
        onStatusChange: setPaymentStatus,
        onConfirmed: () => setShowSuccess(true),
        onError: failure => setError(failure.message),
        onMonitoringStopped: final => setError(`Monitoring stopped after the payment window. Last server status: ${final.status}.`),
      }, () => {});
    } catch (failure) { setError(failure.message); }
    finally { setIsCreating(false); }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    setError('');
    try {
      await terminal.payments.cancel(activePayment.id);
      await activePayment.refresh();
    } catch (failure) { setError(failure.message); }
    finally { setIsCancelling(false); }
  };

  const handleNewTransaction = () => {
    stopPaymentListeners(activePayment);
    clearCart();
    onBack();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 text-slate-900 dark:text-slate-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-2" />Back to shop</Button>
        <h1 className="text-3xl font-bold">Checkout with Skyzai Pay</h1>
        {error && <p role="alert" className="p-4 rounded-lg bg-red-50 text-red-700">{error}</p>}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
            <h2 className="text-xl font-semibold">Your order</h2>
            {cartItems.map(item => <div key={item.id} className="flex justify-between"><span>{item.emoji} {item.name} × {item.quantity}</span><span>{(item.price * item.quantity).toFixed(2)} USDC</span></div>)}
            <div className="border-t pt-4 flex justify-between font-semibold"><span>Total</span><span>{total} USDC</span></div>
            <p className="text-sm text-slate-500">Pay with USDC on Hedera mainnet.</p>
            <Button className="w-full" disabled={!terminal || !cartItems.length || isCreating || !!activePayment} onClick={handleCreatePayment} isLoading={isCreating}>Pay with Skyzai Pay</Button>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-6">
            <div className="flex justify-between items-center"><h2 className="text-xl font-semibold">Payment</h2>{paymentStatus && <StatusBadge status={paymentStatus} />}</div>
            {activePayment ? <>
              {paymentStatus === 'pending' && <>
                <div className="bg-white p-4 inline-block rounded-xl"><QRCode value={activePayment.getQRCode()} size={200} /></div>
                <p className="text-sm flex justify-center items-center gap-2"><Clock className="w-4 h-4" />Scan with the Skyzai app to pay</p>
                <p className="text-sm text-slate-500">Request expires at {activePayment.expiresAt?.toLocaleTimeString()}.</p>
              </>}
              <p className="font-mono text-xs break-all">{activePayment.id}</p>
              {paymentStatus === 'pending' ? <Button variant="outline" className="w-full" disabled={isCancelling} onClick={handleCancel}>Cancel Payment</Button> : <Button onClick={handleNewTransaction}>New transaction</Button>}
            </> : <div className="py-12 text-slate-400"><QrCode className="w-16 h-16 mx-auto mb-4" /><p>Click “Pay with Skyzai Pay” to generate a QR code.</p></div>}
          </div>
        </div>
        {showSuccess && !showReceipt && <SuccessModal payment={activePayment} product={product} onViewReceipt={() => setShowReceipt(true)} onNewTransaction={handleNewTransaction} />}
        {showReceipt && <Receipt payment={activePayment} product={product} businessInfo={businessInfo} selectedChains={selectedChains} onClose={handleNewTransaction} />}
      </div>
    </div>
  );
};

export default CheckoutScreen;
