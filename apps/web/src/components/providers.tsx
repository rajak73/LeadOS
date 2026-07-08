'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';

import { getAccessToken, refreshAccessToken } from '@/lib/auth/token-store';

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
        const url = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url || '';

        const getNewInit = (token: string | null) => {
          if (url.includes('/api/bff/') && token) {
            const headers = new Headers(init?.headers || {});
            headers.set('Authorization', `Bearer ${token}`);
            return {
              ...(init || {}),
              headers,
            };
          }
          return init;
        };

        const token = getAccessToken();
        const newInit = getNewInit(token);

        let response = await originalFetch(input, newInit);

        if (response.status === 401 && url.includes('/api/bff/')) {
          try {
            const newToken = await refreshAccessToken();
            if (newToken) {
              const retryInit = getNewInit(newToken);
              response = await originalFetch(input, retryInit);
            }
          } catch (e) {
            console.error('BFF token refresh/retry failed:', e);
          }
        }

        if (response.status === 401) {
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

