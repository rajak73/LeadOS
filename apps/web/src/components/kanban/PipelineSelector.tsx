'use client';

import * as RadixSelect from '@radix-ui/react-select';
import type { Pipeline } from '@/lib/types/api';

interface PipelineSelectorProps {
  pipelines: Pipeline[];
  activePipelineId: string;
  onChange: (id: string) => void;
}

export function PipelineSelector({ pipelines, activePipelineId, onChange }: PipelineSelectorProps) {
  if (pipelines.length <= 1) return null;

  return (
    <RadixSelect.Root value={activePipelineId} onValueChange={onChange}>
      <RadixSelect.Trigger
        data-testid="pipeline-selector"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 hover:bg-slate-50"
      >
        <RadixSelect.Value />
        <RadixSelect.Icon className="opacity-50">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="z-50 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <RadixSelect.Viewport className="p-1">
            {pipelines.map((p) => (
              <RadixSelect.Item
                key={p.id}
                value={p.id}
                className="flex items-center px-3 py-1.5 text-sm text-slate-900 rounded cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <RadixSelect.ItemText>{p.name}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
