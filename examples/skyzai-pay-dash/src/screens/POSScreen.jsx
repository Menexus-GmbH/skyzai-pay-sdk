import React, { useRef, useEffect } from 'react';
import { 
  Terminal, 
  CreditCard, 
  QrCode, 
  Clock, 
  History 
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { cn } from '../utils/cn';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import ProductButton from '../components/ProductButton';
import SuccessModal from '../components/SuccessModal';
import Receipt from '../components/Receipt';
import { products } from '../data/products';

const POSScreen = ({
  businessInfo,
  selectedChains,
  activePayment,
  selectedProduct,
  paymentStatus,
  showSuccess,
  showReceipt,
  logs,
  isCreating,
  onCreatePayment,
  onNewTransaction,
  onShowReceipt,
  onCloseReceipt
}) => {
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 font-sans text-slate-900 dark:text-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center">
              <Terminal className="text-white h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-none">
                {businessInfo?.businessName || 'POS Terminal'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Accepting: {selectedChains.map(c => c.name).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Connected</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Products */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <CreditCard className="h-5 w-5 text-slate-500" />
                <h2 className="font-semibold text-lg">Quick Products</h2>
              </div>

              <div className="space-y-3">
                {products.map((product) => (
                  <ProductButton
                    key={product.id}
                    emoji={product.emoji}
                    name={product.name}
                    price={product.price}
                    currency={product.currency}
                    onClick={() => onCreatePayment(product)}
                    disabled={isCreating || activePayment}
                    isSelected={selectedProduct?.id === product.id}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Active Payment & Logs */}
          <div className="lg:col-span-7 space-y-6">

            {/* Success Animation Overlay */}
            {showSuccess && !showReceipt && (
              <SuccessModal
                payment={activePayment}
                product={selectedProduct}
                onViewReceipt={onShowReceipt}
                onNewTransaction={onNewTransaction}
              />
            )}

            {/* Receipt Modal */}
            {showReceipt && (
              <Receipt
                payment={activePayment}
                product={selectedProduct}
                businessInfo={businessInfo}
                selectedChains={selectedChains}
                onClose={onCloseReceipt}
              />
            )}

            {/* Active Payment Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm min-h-[400px] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-slate-500" />
                  <h2 className="font-semibold text-lg">Payment Gateway</h2>
                </div>
                {paymentStatus && <StatusBadge status={paymentStatus} />}
              </div>

              <div className="flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
                {activePayment ? (
                  <div className="text-center space-y-6 w-full max-w-sm">
                    {/* QR Code */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 inline-block">
                      <QRCode
                        value={activePayment.getQRCode()}
                        size={200}
                        className="h-auto w-full max-w-[200px]"
                      />
                    </div>

                    {/* Payment Info */}
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Amount</p>
                        <p className="text-3xl font-bold">
                          {selectedProduct?.price} {selectedProduct?.currency}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Product</p>
                        <p className="text-lg font-medium">{selectedProduct?.name}</p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Payment ID</p>
                        <p className="text-xs font-mono bg-slate-100 dark:bg-slate-800 py-1 px-3 rounded text-slate-700 dark:text-slate-300 break-all">
                          {activePayment.id}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Accepted Chains</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {selectedChains.map(c => c.name).join(', ')}
                        </p>
                      </div>
                    </div>

                    {/* Status Message */}
                    {paymentStatus === 'pending' && (
                      <div className="flex items-center justify-center gap-2 text-sm text-slate-500 animate-pulse">
                        <Clock className="h-4 w-4" />
                        <span>Waiting for customer to scan...</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4">
                      <Button
                        variant="outline"
                        onClick={onNewTransaction}
                        className="w-full"
                      >
                        Cancel Payment
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-slate-400">
                    <CreditCard className="h-16 w-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg mb-2">No Active Payment</p>
                    <p className="text-sm opacity-60">Select a product to begin</p>
                  </div>
                )}
              </div>
            </div>

            {/* Event Log */}
            <div className="bg-slate-950 text-slate-50 rounded-xl overflow-hidden shadow-lg border border-slate-800 flex flex-col h-[250px]">
              <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <History className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Transaction Log</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic">System ready...</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="flex gap-3 border-l-2 border-slate-800 pl-3 py-1">
                      <span className="text-slate-500 whitespace-nowrap">{log.timestamp}</span>
                      <span className={cn(
                        "font-medium",
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'success' ? 'text-green-400' :
                        log.type === 'event' ? 'text-blue-400' :
                        log.type === 'warning' ? 'text-yellow-400' :
                        'text-slate-300'
                      )}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default POSScreen;