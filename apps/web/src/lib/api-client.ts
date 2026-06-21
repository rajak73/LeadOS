// Axios API client + interceptors (UI-1.2). Attaches the in-memory bearer token,
// handles 401 → BFF refresh → retry (Sprint 6 M5). The refresh token lives in an
// HttpOnly cookie; the BFF /api/auth/refresh route rotates it and returns a new
// access token. A _retried flag on the config prevents infinite retry loops.

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from './auth/token-store';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retried?: boolean;
  }
}

export interface ApiClientOptions {
  baseURL?: string;
  getToken?: () => string | null;
  /** Injected in tests to intercept the native fetch call for the refresh endpoint. */
  refreshFetch?: typeof fetch;
}

export function createApiClient(options: ApiClientOptions = {}): AxiosInstance {
  const baseURL =
    options.baseURL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const getToken = options.getToken ?? getAccessToken;
  const doRefreshFetch = options.refreshFetch ?? fetch;

  const client = axios.create({
    baseURL,
    withCredentials: true,
    timeout: 30_000,
  });

  client.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const axiosError = error as {
        config?: InternalAxiosRequestConfig;
        response?: { status: number };
      };
      const config = axiosError.config;

      if (!config || axiosError.response?.status !== 401) {
        return Promise.reject(error);
      }

      if (config._retried) {
        clearAccessToken();
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(error);
      }

      config._retried = true;

      try {
        const refreshRes = await doRefreshFetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!refreshRes.ok) throw new Error('refresh failed');
        const json = (await refreshRes.json()) as { data?: { accessToken?: string } };
        const newToken = json.data?.accessToken;
        if (!newToken) throw new Error('no token in refresh response');
        setAccessToken(newToken);
        config.headers.set('Authorization', `Bearer ${newToken}`);
        return client(config);
      } catch {
        clearAccessToken();
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(error);
      }
    },
  );

  return client;
}

export const apiClient = createApiClient();
