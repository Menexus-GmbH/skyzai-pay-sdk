import React, { useRef } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import Button from './ui/Button';
import { formatDate } from '../utils/formatters';

const Receipt = ({ payment, product, businessInfo, selectedChains, onClose }) => {
  const receiptRef = useRef(null);
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleDownloadPDF = () => {
    // For now, just trigger print (browser's Save as PDF)
    window.print();
  };
  
  const confirmedTime = payment.fullData?.confirmedAt || payment.confirmedAt;
  const createdTime = payment.fullData?.createdAt || payment.createdAt;
  const txHash = payment.fullData?.txHash || payment.txHash;
  const walletAddress = payment.fullData?.destinations?.walletAddress || 
                       selectedChains[0]?.address;
  
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        
        {/* Header with close button */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Payment Receipt
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5 text-slate-700 dark:text-slate-300" />
          </button>
        </div>

        {/* Receipt Content */}
        <div ref={receiptRef} className="p-8 space-y-6">
          
          {/* Header */}
          <div className="text-center border-b-2 border-slate-200 dark:border-slate-700 pb-6">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-2">
              Payment Receipt
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {businessInfo?.businessName || 'Skyzai Pay'}
            </p>
          </div>
          
          {/* Transaction Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Status
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <p className="font-semibold text-green-600 dark:text-green-400">
                    COMPLETED
                  </p>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Payment ID
                </p>
                <p className="font-mono text-sm text-slate-900 dark:text-slate-50 break-all">
                  {payment.id}
                </p>
              </div>
            </div>
            
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-slate-500 dark:text-slate-400">Amount Paid</p>
                <p className="text-4xl font-bold text-slate-900 dark:text-slate-50">
                  {product?.price} <span className="text-2xl">{product?.currency}</span>
                </p>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <p className="text-slate-500 dark:text-slate-400">Product</p>
                <p className="font-medium text-slate-900 dark:text-slate-50">
                  {product?.emoji} {product?.name}
                </p>
              </div>
            </div>
          </div>
          
          {/* Blockchain Details */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-semibold">
              Blockchain Details
            </p>
            
            {txHash && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Transaction Hash
                </p>
                <p className="font-mono text-xs text-slate-900 dark:text-slate-50 break-all bg-white dark:bg-slate-900 p-2 rounded">
                  {txHash}
                </p>
              </div>
            )}
            
            {walletAddress && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Recipient Address
                </p>
                <p className="font-mono text-xs text-slate-900 dark:text-slate-50 break-all bg-white dark:bg-slate-900 p-2 rounded">
                  {walletAddress}
                </p>
              </div>
            )}
            
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Network
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                {selectedChains.map(c => c.name).join(', ')}
              </p>
            </div>
          </div>
          
          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Created At
              </p>
              <p className="font-medium text-slate-900 dark:text-slate-50">
                {formatDate(createdTime)}
              </p>
            </div>
            
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Confirmed At
              </p>
              <p className="font-medium text-slate-900 dark:text-slate-50">
                {formatDate(confirmedTime)}
              </p>
            </div>
          </div>
          
          {/* Footer */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            <p>Thank you for your business!</p>
            <p className="mt-1">Powered by Skyzai Pay</p>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-6 flex gap-3 print:hidden">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePrint}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Receipt
          </Button>
          
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDownloadPDF}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Save as PDF
          </Button>
          
          <Button
            onClick={onClose}
            className="flex-1"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Receipt;