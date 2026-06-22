'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { setAccessToken } from '@/lib/auth/token-store';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const json = (await res.json()) as {
        success: boolean;
        data?: { accessToken?: string };
        error?: { message?: string };
      };

      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Invalid email or password');
        return;
      }

      const token = json.data?.accessToken;
      if (token) setAccessToken(token);

      router.replace('/');
    } catch {
      setError('Unable to reach the server. Check that the API is running.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg-elevated border border-border rounded-xl p-8 space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-primary-400 uppercase tracking-widest mb-3">LeadOS</p>
        <h1 className="text-xl font-semibold text-text-primary">Sign in to your workspace</h1>
        <p className="text-sm text-text-tertiary">Enter your credentials to continue</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium text-text-secondary block">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium text-text-secondary block">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={loading}
          className="w-full justify-center"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
