'use client';

import * as RadixSelect from '@radix-ui/react-select';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({ value, onValueChange, options, placeholder, disabled, className = '' }: SelectProps) {
  const disabledProp = disabled !== undefined ? { disabled } : {};
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} {...disabledProp}>
      <RadixSelect.Trigger
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary hover:bg-bg-subtle w-full ${className}`}
      >
        <RadixSelect.Value placeholder={placeholder ?? 'Select…'} />
        <RadixSelect.Icon className="ml-auto opacity-50">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="z-50 bg-bg-elevated border border-border rounded-lg shadow-xl overflow-hidden min-w-[160px]">
          <RadixSelect.Viewport className="p-1">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                className="flex items-center px-3 py-1.5 text-sm text-text-primary rounded cursor-pointer hover:bg-bg-subtle focus:bg-bg-subtle focus:outline-none"
              >
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
