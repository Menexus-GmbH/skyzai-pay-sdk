import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import Button from './ui/Button';

const SuccessModal = ({ payment, product, onViewReceipt, onNewTransaction }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center space-y-6 shadow-2xl max-w-md mx-4 relative">
        {/* Close button */}
        <button
          onClick={onNewTransaction}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-5 w-5 text-slate-700 dark:text-slate-300" />
        </button>
        
        <div className="flex justify-center">
          <div className="h-24 w-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
            Payment Successful!
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg">
            {product?.price} {product?.currency}
          </p>
          <p className="text-sm text-slate-500 mt-2">
            for {product?.name}
          </p>
          
          {payment?.txHash && (
            <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Transaction Hash
              </p>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                {payment.txHash}
              </p>
            </div>
          )}
        </div>
        
        <div className="space-y-3">
          <Button
            onClick={onViewReceipt}
            className="w-full"
          >
            View Receipt
          </Button>
          
          <Button
            variant="outline"
            onClick={onNewTransaction}
            className="w-full"
          >
            New Transaction
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SuccessModal;