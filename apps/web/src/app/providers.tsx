import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { createQueryClient } from '@/providers/query-client';
import { SessionProvider } from '@/providers/session';
import { ThemeProvider, useTheme } from '@/providers/theme';
import { TooltipProvider } from '@/components/ui/tooltip';

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="top-right"
      visibleToasts={4}
      closeButton
      richColors={false}
      offset={{ top: 64, right: 16 }}
      mobileOffset={{ top: 64 }}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            'rounded-lg! border! border-border! bg-surface-raised! text-fg! shadow-lg! font-sans!',
          description: 'text-fg-muted!',
          error: 'border-danger/40!',
          success: 'border-success/40!',
        },
      }}
    />
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <ThemedToaster />
          </TooltipProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
