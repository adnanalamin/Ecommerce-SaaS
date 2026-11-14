/**
 * NEXORA Enterprise Design System
 * Breadcrumb Navigation Component
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-xs ${className}`}>
      <ol className="flex items-center gap-1.5 list-none p-0 m-0">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isActive = item.active || isLast;

          return (
            <li key={index} className="flex items-center gap-1.5">
              {isActive ? (
                <span
                  aria-current="page"
                  className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap"
                >
                  {item.label}
                </span>
              ) : item.onClick ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {item.label}
                </button>
              ) : item.href ? (
                <a
                  href={item.href}
                  className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors whitespace-nowrap"
                >
                  {item.label}
                </a>
              ) : (
                <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{item.label}</span>
              )}

              {!isLast && (
                <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-600 shrink-0" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
