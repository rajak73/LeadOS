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
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary hover:bg-bg-subtle"
      >
        <RadixSelect.Value />
        <RadixSelect.Icon className="opacity-50">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="z-50 bg-bg-elevated border border-border rounded-lg shadow-xl overflow-hidden">
          <RadixSelect.Viewport className="p-1">
            {pipelines.map((p) => (
              <RadixSelect.Item
                key={p.id}
                value={p.id}
                className="flex items-center px-3 py-1.5 text-sm text-text-primary rounded cursor-pointer hover:bg-bg-subtle focus:bg-bg-subtle focus:outline-none"
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
