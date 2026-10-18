import React from 'react';
import { cn } from '../../utils/cn';

const Input = ({ label, className, ...props }) => (
  <div className="space-y-1.5">
    {label && (
      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-900 dark:text-slate-100">
        {label}
      </label>
    )}
    <input
      className={cn(
        "flex h-10 w-full rounded-md border px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-950 focus-visible:ring-offset-2",
        "dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300",
        className
      )}
      {...props}
    />
  </div>
);

export default Input;