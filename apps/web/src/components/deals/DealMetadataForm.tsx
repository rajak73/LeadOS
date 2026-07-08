'use client';

import { useState, useEffect } from 'react';
import { usePatchDeal } from '@/lib/hooks/useDealActions';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/types/api';
import type { Deal } from '@/lib/types/api';

interface DealMetadataFormProps {
  deal: Deal;
}

export function DealMetadataForm({ deal }: DealMetadataFormProps) {
  const { mutate: patch } = usePatchDeal(deal.id);
  const { toast } = useToast();

  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(deal.value ?? '');
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    deal.expectedCloseDate ? deal.expectedCloseDate.split('T')[0] : '',
  );

  useEffect(() => {
    setTitle(deal.title);
    setValue(deal.value ?? '');
    setExpectedCloseDate(deal.expectedCloseDate ? deal.expectedCloseDate.split('T')[0] : '');
  }, [deal.id, deal.title, deal.value, deal.expectedCloseDate]);

  const handleBlur = (field: string, val: unknown) => {
    patch(
      { [field]: val },
      { onError: () => toast(`Failed to update ${field}`, 'error') },
    );
  };

  const isReadOnly = deal.status !== 'OPEN';

  return (
    <div className="space-y-4" data-testid="deal-metadata-form">
      {/* Title */}
      <div>
        <label className="text-xs text-slate-500 block mb-1">Title</label>
        {isReadOnly ? (
          <p className="text-base font-semibold text-slate-900">{deal.title}</p>
        ) : (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== deal.title && handleBlur('title', title)}
            className="w-full text-base font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary-500 focus:outline-none pb-0.5 transition-colors"
            data-testid="field-title"
          />
        )}
      </div>

      {/* Value */}
      <div className="flex gap-6">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Value</label>
          {isReadOnly ? (
            <p className="text-sm text-slate-900">{formatCurrency(deal.value, deal.currency)}</p>
          ) : (
            <input
              type="number"
              value={value as string}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => value !== deal.value && handleBlur('value', value ? Number(value) : null)}
              className="w-32 text-sm text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary-500 focus:outline-none pb-0.5 transition-colors"
              data-testid="field-value"
            />
          )}
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Expected close</label>
          {isReadOnly ? (
            <p className="text-sm text-slate-900">{deal.expectedCloseDate?.split('T')[0] ?? '—'}</p>
          ) : (
            <input
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              onBlur={() =>
                expectedCloseDate !== (deal.expectedCloseDate?.split('T')[0] ?? '') &&
                handleBlur('expectedCloseDate', expectedCloseDate || null)
              }
              className="text-sm text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary-500 focus:outline-none pb-0.5 transition-colors"
              data-testid="field-expected-close-date"
            />
          )}
        </div>
      </div>

      {/* Read-only metadata */}
      <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 border-t border-slate-200 pt-4">
        <div>
          <span className="block mb-0.5">Status</span>
          <span className={`font-medium ${deal.status === 'WON' ? 'text-green-400' : deal.status === 'LOST' ? 'text-red-400' : 'text-slate-600'}`}>
            {deal.status}
          </span>
        </div>
        <div>
          <span className="block mb-0.5">Currency</span>
          <span className="text-slate-600">{deal.currency}</span>
        </div>
        {deal.closedAt && (
          <div>
            <span className="block mb-0.5">Closed</span>
            <span className="text-slate-600">{deal.closedAt.split('T')[0]}</span>
          </div>
        )}
        <div>
          <span className="block mb-0.5">Created</span>
          <span className="text-slate-600">{deal.createdAt.split('T')[0]}</span>
        </div>
      </div>

      {deal.lostReason && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
          <span className="font-medium">Lost reason: </span>{deal.lostReason}
        </div>
      )}
    </div>
  );
}
