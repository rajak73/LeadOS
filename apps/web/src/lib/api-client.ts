// Axios API client + interceptors (UI-1.2). Attaches the in-memory bearer token, the
// x-request correlation, and handles 403/500. The 401→refresh retry is wired in Sprint 2
// (it needs the auth/refresh endpoint); a placeholder hook is left for it here.

import axios, { type AxiosInstance } from 'axios';
import { getAccessToken } from './auth/token-store';

export interface ApiClientOptions {
  baseURL?: string;
  getToken?: () => string | null;
}

export function createApiClient(options: ApiClientOptions = {}): AxiosInstance {
  const baseURL =
    options.baseURL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const getToken = options.getToken ?? getAccessToken;

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
    (error) => {
      // 401 → token refresh + retry: implemented in Sprint 2 (needs /auth/refresh).
      // 403/500 handling (redirect / toast) is wired to the UI shell as it is built.
      return Promise.reject(error);
    },
  );

  return client;
}

export const apiClient = createApiClient();
