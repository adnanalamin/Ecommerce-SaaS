/**
 * NEXORA Enterprise Design System
 * Skeleton Loader Component
 */

import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
}) => {
  const variantStyles = {
    text: 'h-3.5 w-full rounded',
    circular: 'rounded-full h-9 w-9 shrink-0',
    rectangular: 'rounded-lg h-24 w-full',
  };

  const inlineStyles: React.CSSProperties = {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };

  return (
    <div
      aria-hidden="true"
      style={inlineStyles}
      className={`animate-pulse bg-slate-200/80 dark:bg-slate-800 ${variantStyles[variant]} ${className}`}
    />
  );
};

export const SkeletonTable: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 4,
  columns = 4,
}) => {
  return (
    <div className="w-full space-y-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};
