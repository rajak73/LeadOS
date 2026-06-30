'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(), 
          password,
          organizationName: organizationName.trim()
        }),
      });

      const json = (await res.json()) as {
        success: boolean;
        error?: {
          message?: string;
          issues?: Array<{ message?: string } | unknown>;
        };
      };

      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Registration failed. Please try again.');
        return;
      }

      setSuccess(true);
      // Wait a moment then redirect to login
      setTimeout(() => {
        router.replace('/login');
      }, 3000);
    } catch {
      setError('Unable to reach the server. Check that the API is running.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-white border border-gray-150 rounded-2xl p-8 space-y-6 text-center shadow-md">
        <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Registration Successful!</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Your workspace has been created. Please check your email to verify your account, then sign in.
        </p>
        <Link href="/login" className="block mt-4 text-indigo-600 hover:text-indigo-700 text-sm font-semibold">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-150 rounded-2xl p-8 space-y-6 shadow-md shadow-gray-100/50">
      <div className="space-y-1">
        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">LeadOS</p>
        <h1 className="text-xl font-bold text-gray-900">Create your workspace</h1>
        <p className="text-sm text-gray-400">Get started with LeadOS in seconds</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="firstName" className="text-xs font-semibold text-gray-700 block">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lastName" className="text-xs font-semibold text-gray-700 block">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition-all"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="organizationName" className="text-xs font-semibold text-gray-700 block">
            Workspace Name
          </label>
          <input
            id="organizationName"
            type="text"
            required
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="Acme Corp"
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition-all"
          />
        </div>

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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition-all"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Must be at least 8 characters, contain an uppercase letter, a number, and a special character.
          </p>
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
          {loading ? 'Creating workspace…' : 'Sign up'}
        </Button>
        
        <div className="text-center mt-4">
          <p className="text-xs text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-700 transition-colors font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}

