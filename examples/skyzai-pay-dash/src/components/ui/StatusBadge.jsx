import React from 'react';
import {
  Clock,
  CheckCircle2,
  History,
  XCircle,
  Loader2,
  Terminal
} from 'lucide-react';
import { cn } from '../../utils/cn';

const StatusBadge = ({ status }) => {
  const styles = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
    completed: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    expired: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
    failed: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    cancelled: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    created: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
  };

  const icons = {
    pending: Clock,
    completed: CheckCircle2,
    expired: History,
    cancelled: XCircle,
    failed: XCircle,
    created: Loader2
  };

  const Icon = icons[status] || Terminal;
  const style = styles[status] || styles.created;

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border", style)}>
      <Icon className="w-3.5 h-3.5" />
      {status.toUpperCase()}
    </span>
  );
};

export default StatusBadge;