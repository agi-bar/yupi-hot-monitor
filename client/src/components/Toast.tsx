import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Toast as ToastType, ToastType as ToastTypeEnum } from '../hooks/useToast';

interface ToastProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

function getToastIcon(type: ToastTypeEnum) {
  switch (type) {
    case 'success': return <Check className="w-4 h-4" />;
    case 'error': return <X className="w-4 h-4" />;
    case 'warning': return <AlertTriangle className="w-4 h-4" />;
    default: return <Info className="w-4 h-4" />;
  }
}

function getToastStyles(type: ToastTypeEnum) {
  switch (type) {
    case 'success':
      return 'bg-emerald-500/10 dark:bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
    case 'error':
      return 'bg-red-500/10 dark:bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400';
    case 'warning':
      return 'bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400';
    default:
      return 'bg-blue-500/10 dark:bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400';
  }
}

export default function Toast({ toasts, onRemove }: ToastProps) {
  return (
    <AnimatePresence>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "px-5 py-3 rounded-xl backdrop-blur-xl flex items-center gap-3 shadow-lg border",
              getToastStyles(toast.type)
            )}
            onClick={() => onRemove(toast.id)}
          >
            {getToastIcon(toast.type)}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        ))}
      </div>
    </AnimatePresence>
  );
}