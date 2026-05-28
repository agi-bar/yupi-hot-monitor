import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'primary';
  isLoading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  confirmVariant = 'danger',
  isLoading = false,
  disabled = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const [isClosing, setIsClosing] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    if (disabled || isLoading) return;
    setIsClosing(true);
    setTimeout(() => {
      onConfirm();
      setIsClosing(false);
    }, 200);
  }, [disabled, isLoading, onConfirm]);

  const handleCancel = useCallback(() => {
    if (isLoading) return;
    setIsClosing(true);
    setTimeout(() => {
      onCancel();
      setIsClosing(false);
    }, 200);
  }, [isLoading, onCancel]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isClosing && !isLoading) {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isClosing, isLoading, handleCancel]);

  const isDark = theme === 'dark';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`fixed inset-0 backdrop-blur-md z-50 ${
              isDark ? 'bg-black/60' : 'bg-black/40'
            }`}
            onClick={handleCancel}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={isClosing ? { opacity: 0, scale: 0.95, y: 20 } : { opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className={`rounded-xl border ${
              isDark
                ? 'bg-[#0d0d20]/95 border-white/10'
                : 'bg-white border-gray-200'
            } shadow-2xl overflow-hidden`}>
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    confirmVariant === 'danger'
                      ? 'bg-red-500/10 text-red-500'
                      : 'bg-blue-500/10 text-blue-500'
                  }`}>
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-lg font-semibold ${
                      isDark ? 'text-white' : 'text-gray-900'
                    }`}>
                      {title}
                    </h3>
                    <p className={`mt-2 text-sm ${
                      isDark ? 'text-slate-400' : 'text-gray-600'
                    }`}>
                      {message}
                    </p>
                  </div>
                  <button
                    onClick={handleCancel}
                    className={`flex-shrink-0 p-1 rounded-lg transition-colors ${
                      isDark
                        ? 'text-slate-400 hover:text-white hover:bg-white/10'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 px-6 py-4 ${
                isDark ? 'bg-white/[0.02]' : 'bg-gray-50'
              }`}>
                <button
                  onClick={handleCancel}
                  disabled={isLoading}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isDark
                      ? 'text-slate-400 hover:text-white hover:bg-white/10'
                      : 'text-gray-600 hover:bg-gray-100'
                  } disabled:opacity-50`}
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={disabled || isLoading}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    confirmVariant === 'danger'
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  } disabled:opacity-50`}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
