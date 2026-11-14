/**
 * NEXORA Enterprise Design System
 * Pagination Component
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  totalRecords?: number;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  totalRecords,
  className = '',
}) => {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 py-2 ${className}`}>
      {/* Record summary */}
      <div className="flex items-center gap-2">
        {totalRecords !== undefined ? (
          <span>
            Total <strong className="font-mono text-slate-900 dark:text-slate-100">{totalRecords}</strong> records
          </span>
        ) : (
          <span>
            Page <strong className="font-mono text-slate-900 dark:text-slate-100">{currentPage}</strong> of{' '}
            <strong className="font-mono text-slate-900 dark:text-slate-100">{totalPages || 1}</strong>
          </span>
        )}

        {pageSize && onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-3">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => onPageChange(currentPage - 1)}
          className="flex items-center justify-center h-7 px-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline ml-1 text-[11px]">Prev</span>
        </button>

        {/* Current page indicator */}
        <span className="h-7 px-3 flex items-center justify-center font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded">
          {currentPage} / {totalPages || 1}
        </span>

        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onPageChange(currentPage + 1)}
          className="flex items-center justify-center h-7 px-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          aria-label="Next page"
        >
          <span className="hidden sm:inline mr-1 text-[11px]">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
