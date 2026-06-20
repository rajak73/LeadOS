'use client';

import { useState } from 'react';
import { useForecast } from '@/lib/hooks/useForecast';
import { formatCurrency } from '@/lib/types/api';

interface ForecastPanelProps {
  pipelineId: string;
}

export function ForecastPanel({ pipelineId }: ForecastPanelProps) {
  const { data: rows = [] } = useForecast(pipelineId);
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) return null;

  const totalWeighted = rows.reduce((sum, r) => sum + r.weightedValue, 0);
  const totalDeals = rows.reduce((sum, r) => sum + r.dealCount, 0);

  return (
    <div className="bg-bg-subtle/50 border border-border rounded-xl p-3 shrink-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary w-full text-left"
      >
        <span>Weighted Forecast</span>
        <span className="ml-auto font-medium text-text-primary">{formatCurrency(totalWeighted)}</span>
        <span className="opacity-50">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="mt-3 text-xs">
          <div className="grid grid-cols-4 gap-2 text-text-tertiary border-b border-border pb-1 mb-1">
            <span>Stage</span>
            <span className="text-right">Deals</span>
            <span className="text-right">Value</span>
            <span className="text-right">Weighted</span>
          </div>
          {rows.map((row) => (
            <div key={row.stageId} className="grid grid-cols-4 gap-2 py-0.5 text-text-secondary">
              <span className="truncate">{row.stageName}</span>
              <span className="text-right">{row.dealCount}</span>
              <span className="text-right">{formatCurrency(row.totalValue)}</span>
              <span className="text-right">{formatCurrency(row.weightedValue)}</span>
            </div>
          ))}
          <div className="grid grid-cols-4 gap-2 pt-1 border-t border-border font-medium text-text-primary">
            <span>Total</span>
            <span className="text-right">{totalDeals}</span>
            <span className="text-right">—</span>
            <span className="text-right">{formatCurrency(totalWeighted)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
