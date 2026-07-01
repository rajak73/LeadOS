'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

      router.replace('/dashboard');
    } catch {
      setError('Unable to reach the server. Check that the API is running.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg-elevated border border-border-strong rounded-2xl p-8 space-y-6 shadow-xl shadow-primary-900/10 backdrop-blur-xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent pointer-events-none" />
      
      <div className="space-y-1 relative z-10">
        <p className="text-xs font-bold text-primary-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
          LeadOS
        </p>
        <h1 className="text-xl font-bold text-text-primary">Sign in to your workspace</h1>
        <p className="text-sm text-text-secondary">Enter your credentials to continue</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-text-secondary block">
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
            className="w-full px-3 py-2 text-sm bg-bg-overlay border border-border-default rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold text-text-secondary block">
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
            className="w-full px-3 py-2 text-sm bg-bg-overlay border border-border-default rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
          />
        </div>

        {error && (
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={loading}
          className="w-full justify-center h-11 rounded-xl bg-primary-600 text-white hover:bg-primary-500 hover:shadow-lg hover:shadow-primary-500/20 duration-200 ring-1 ring-primary-500/50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="text-center pt-2 relative z-10">
        <p className="text-xs text-text-tertiary">
          Don't have an account?{' '}
          <Link href="/signup" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
