/**
 * NEXORA Enterprise Design System
 * Form Radio Component & RadioGroup
 */

import React, { forwardRef, useId } from 'react';

export interface RadioOption {
  label: React.ReactNode;
  value: string;
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label?: string;
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  label,
  name,
  options,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`} role="radiogroup" aria-label={label}>
      {label && (
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label}
        </span>
      )}

      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <RadioItem
            key={option.value}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange?.(option.value)}
            disabled={disabled || option.disabled}
            label={option.label}
            description={option.description}
          />
        ))}
      </div>

      {error && (
        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
};

export interface RadioItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const RadioItem = forwardRef<HTMLInputElement, RadioItemProps>(
  ({ label, description, id, disabled, checked, className = '', ...props }, ref) => {
    const generatedId = useId();
    const radioId = id || generatedId;

    return (
      <label
        htmlFor={radioId}
        className={`group flex items-start gap-2.5 select-none cursor-pointer ${
          disabled ? 'cursor-not-allowed opacity-50' : ''
        }`}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            type="radio"
            id={radioId}
            disabled={disabled}
            checked={checked}
            className="peer sr-only"
            {...props}
          />
          <div
            className={`h-4 w-4 rounded-full border transition-colors flex items-center justify-center bg-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500 peer-checked:border-indigo-600 dark:bg-slate-900 dark:peer-checked:border-indigo-500 ${
              'border-slate-300 dark:border-slate-700 group-hover:border-slate-400 dark:group-hover:border-slate-600'
            } ${className}`}
          >
            <div className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-500 scale-0 transition-transform peer-checked:scale-100" />
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
    );
  }
);

RadioItem.displayName = 'RadioItem';
