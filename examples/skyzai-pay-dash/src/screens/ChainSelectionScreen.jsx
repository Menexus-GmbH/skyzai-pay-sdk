import React from 'react';
import { Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../utils/cn';
import Button from '../components/ui/Button';

const ChainSelectionScreen = ({ 
  businessInfo, 
  selectedChains, 
  onToggleChain, 
  onComplete 
}) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-900 dark:text-slate-50">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center">
              <Link2 className="text-white h-6 w-6" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {businessInfo?.businessName || 'Select Payment Chains'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Choose which blockchain networks to accept payments on
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          
          {businessInfo?.chains && businessInfo.chains.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {businessInfo.chains.map((chain) => {
                const isSelected = selectedChains.find(c => c.id === chain.id);
                return (
                  <button
                    key={chain.id}
                    onClick={() => onToggleChain(chain)}
                    className={cn(
                      "p-4 rounded-lg border-2 text-left transition-all",
                      isSelected
                        ? "border-slate-900 bg-slate-50 dark:border-slate-50 dark:bg-slate-800"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{chain.name}</span>
                      {isSelected && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mb-1">{chain.address}</p>
                    <p className="text-xs text-slate-400">
                      {chain.tokens?.join(', ') || 'USDC'}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No wallet addresses found for this business.</p>
              <p className="text-sm mt-2">Please set up wallet addresses in your Skyzai app.</p>
            </div>
          )}

          <div className="pt-4 space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Selected: {selectedChains.length > 0 ? selectedChains.map(c => c.name).join(', ') : 'None'}
            </p>
            <Button
              className="w-full"
              onClick={onComplete}
              disabled={selectedChains.length === 0}
            >
              Continue to POS
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChainSelectionScreen;