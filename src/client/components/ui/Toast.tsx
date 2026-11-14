/**
 * NEXORA Enterprise Design System
 * Toast Container & Notification Item
 */

import React from 'react';
import { useToast, ToastItem } from '../../context/ToastContext.tsx';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    error: <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />,
    info: <Info className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />,
  };

  const borders = {
    success: 'border-emerald-200 dark:border-emerald-900/60',
    warning: 'border-amber-200 dark:border-amber-900/60',
    error: 'border-rose-200 dark:border-rose-900/60',
    info: 'border-sky-200 dark:border-sky-900/60',
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border ${borders[toast.type]} bg-white dark:bg-slate-900 shadow-xl text-xs transition-all animate-in slide-in-from-bottom-3 duration-200`}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <h5 className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">
          {toast.title}
        </h5>
        {toast.description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        type="button"
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
