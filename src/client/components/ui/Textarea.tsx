/**
 * NEXORA Enterprise Design System
 * Form Textarea Component
 */

import React, { forwardRef, useId } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  showCount?: boolean;
  maxLength?: number;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helperText,
      error,
      showCount = false,
      maxLength,
      id,
      disabled,
      required,
      value,
      defaultValue,
      className = '',
      containerClassName = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    const hasError = Boolean(error);
    const currentLength = typeof value === 'string' ? value.length : 0;

    return (
      <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
        <div className="flex items-center justify-between">
          {label && (
            <label htmlFor={textareaId} className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {label}
              {required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}
            </label>
          )}
          {showCount && maxLength && (
            <span className="text-[10px] text-slate-400 font-mono">
              {currentLength}/{maxLength}
            </span>
          )}
        </div>

        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          rows={props.rows || 3}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
          className={`w-full rounded-lg border bg-white p-3 text-xs text-slate-900 transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 ${
            hasError
              ? 'border-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 dark:border-rose-500'
              : 'border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:focus:border-indigo-400'
          } ${className}`}
          {...props}
        />

        {error && (
          <p id={errorId} className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-[11px] text-slate-500 dark:text-slate-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
