'use client';

import { Button } from '@/components/ui/Button';

interface EmptyColumnProps {
  stageName: string;
  onAddDeal: () => void;
}

export function EmptyColumn({ stageName, onAddDeal }: EmptyColumnProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
      <div className="text-3xl mb-3 opacity-30">📋</div>
      <p className="text-xs text-slate-500 mb-3">No deals in {stageName}</p>
      <Button size="sm" variant="ghost" onClick={onAddDeal}>
        + Add Deal
      </Button>
    </div>
  );
}
