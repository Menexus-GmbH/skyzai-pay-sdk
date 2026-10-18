import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../utils/cn';

const ProductButton = ({ emoji, name, price, currency, onClick, disabled, isSelected }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "w-full p-4 rounded-lg border-2 text-left transition-all",
      "hover:border-slate-900 dark:hover:border-slate-50",
      "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200",
      isSelected
        ? "border-slate-900 bg-slate-50 dark:border-slate-50 dark:bg-slate-800"
        : "border-slate-200 dark:border-slate-800"
    )}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{emoji}</span>
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-slate-500">
            {price} {currency}
          </p>
        </div>
      </div>
      {isSelected && (
        <CheckCircle2 className="h-5 w-5 text-green-600" />
      )}
    </div>
  </button>
);

export default ProductButton;