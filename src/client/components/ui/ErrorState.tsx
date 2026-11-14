/**
 * NEXORA Enterprise Design System
 * Error State Component
 */

import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button.tsx';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  variant?: 'card' | 'inline';
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected error occurred while processing this request. Please try again.',
  onRetry,
  className = '',
  variant = 'card',
}) => {
  if (variant === 'inline') {
    return (
      <div
        role="alert"
        className={`flex items-start gap-2.5 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-xs ${className}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-[11px] text-rose-700/80 dark:text-rose-400/80 mt-0.5">{message}</p>
        </div>
        {onRetry && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRetry}
            className="text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-white h-7 px-2"
          >
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 ${className}`}
    >
      <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h4 className="text-sm font-bold text-rose-900 dark:text-rose-100">{title}</h4>
      <p className="text-xs text-rose-700/90 dark:text-rose-400 max-w-sm mt-1 mb-4 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          leftIcon={<RotateCcw className="h-3 w-3" />}
          onClick={onRetry}
          className="border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100/50 dark:hover:bg-rose-900/40"
        >
          Try Again
        </Button>
      )}
    </div>
  );
};
