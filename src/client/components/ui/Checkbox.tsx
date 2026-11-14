/**
 * NEXORA Enterprise Design System
 * Form Checkbox Component
 */

import React, { forwardRef, useId } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      error,
      id,
      disabled,
      checked,
      className = '',
      containerClassName = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;

    return (
      <div className={`flex flex-col gap-1 ${containerClassName}`}>
        <label
          htmlFor={checkboxId}
          className={`group flex items-start gap-2.5 select-none cursor-pointer ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          <div className="relative flex items-center justify-center mt-0.5">
            <input
              ref={ref}
              type="checkbox"
              id={checkboxId}
              disabled={disabled}
              checked={checked}
              className="peer sr-only"
              {...props}
            />
            <div
              className={`h-4 w-4 rounded border transition-colors flex items-center justify-center bg-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 dark:bg-slate-900 dark:peer-checked:bg-indigo-500 dark:peer-checked:border-indigo-500 ${
                error
                  ? 'border-rose-500'
                  : 'border-slate-300 dark:border-slate-700 group-hover:border-slate-400 dark:group-hover:border-slate-600'
              } ${className}`}
            >
              <Check className="h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
            </div>
          </div>

          {(label || description) && (
            <div className="flex flex-col">
              {label && (
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-tight">
                  {label}
                </span>
              )}
              {description && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {description}
                </span>
              )}
            </div>
          )}
        </label>

        {error && (
          <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 pl-6.5">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
