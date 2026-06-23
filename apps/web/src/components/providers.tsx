'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';

// App-wide client providers. TanStack Query owns server state.
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const originalFetch = window.fetch;
      window.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        if (response.status === 401) {
          const url = typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url || '';
          if (
            (url.includes('/api/bff/') || url.includes('/api/auth/refresh')) &&
            window.location.pathname !== '/login'
          ) {
            window.location.href = '/login';
          }
        }
        return response;
      };
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

