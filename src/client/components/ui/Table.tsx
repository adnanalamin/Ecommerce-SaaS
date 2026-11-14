/**
 * NEXORA Enterprise Design System
 * Data Table Component
 */

import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  sortable?: boolean;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  sortKey?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  isLoading?: boolean;
  emptyMessage?: React.ReactNode;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  sortKey,
  sortOrder,
  onSort,
  isLoading = false,
  emptyMessage = 'No records found.',
  onRowClick,
  className = '',
}: TableProps<T>) {
  return (
    <div className={`w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${className}`}>
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <tr>
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const alignClass =
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`py-2.5 px-3.5 ${alignClass} whitespace-nowrap`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(col.key)}
                      className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer ${
                        col.align === 'right' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <span>{col.header}</span>
                      {isSorted ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-slate-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                  <span>Loading data...</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, idx) => {
              const rowKey = keyExtractor(item, idx);
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick?.(item)}
                  className={`transition-colors ${
                    onRowClick
                      ? 'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                      : 'hover:bg-slate-50/40 dark:hover:bg-slate-800/30'
                  }`}
                >
                  {columns.map((col) => {
                    const alignClass =
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';
                    const content = col.render
                      ? col.render(item, idx)
                      : String((item as Record<string, unknown>)[col.key] ?? '');

                    return (
                      <td
                        key={col.key}
                        className={`py-2.5 px-3.5 text-slate-700 dark:text-slate-300 ${alignClass} whitespace-nowrap`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
