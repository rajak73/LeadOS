'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  defaultValue: string;
  tabs: TabItem[];
  className?: string;
}

export function Tabs({ defaultValue, tabs, className = '' }: TabsProps) {
  return (
    <RadixTabs.Root defaultValue={defaultValue} className={`flex flex-col h-full ${className}`}>
      <RadixTabs.List className="flex gap-1 border-b border-border px-1 shrink-0">
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className="px-3 py-2 text-sm text-text-secondary data-[state=active]:text-text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary-500 -mb-px transition-colors"
          >
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content key={tab.value} value={tab.value} className="flex-1 overflow-auto pt-4">
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
