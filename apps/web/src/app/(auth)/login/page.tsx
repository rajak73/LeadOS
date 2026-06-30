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
    <div className="bg-white border border-gray-150 rounded-2xl p-8 space-y-6 shadow-md shadow-gray-100/50">
      <div className="space-y-1">
        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">LeadOS</p>
        <h1 className="text-xl font-bold text-gray-900">Sign in to your workspace</h1>
        <p className="text-sm text-gray-400">Enter your credentials to continue</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-gray-700 block">
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
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold text-gray-700 block">
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
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition-all"
          />
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-150 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={loading}
          className="w-full justify-center h-11 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/15 duration-200"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="text-center pt-2">
        <p className="text-xs text-gray-500">
          Don't have an account?{' '}
          <Link href="/signup" className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

