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
      <div className="bg-bg-elevated border border-border rounded-xl p-8 space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-text-primary">Registration Successful!</h1>
        <p className="text-sm text-text-secondary">
          Your workspace has been created. Please check your email to verify your account, then sign in.
        </p>
        <Link href="/login" className="block mt-4 text-primary-400 hover:text-primary-300 text-sm font-medium">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-bg-elevated border border-border rounded-xl p-8 space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-primary-400 uppercase tracking-widest mb-3">LeadOS</p>
        <h1 className="text-xl font-semibold text-text-primary">Create your workspace</h1>
        <p className="text-sm text-text-tertiary">Get started with LeadOS in seconds</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="firstName" className="text-xs font-medium text-text-secondary block">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lastName" className="text-xs font-medium text-text-secondary block">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="organizationName" className="text-xs font-medium text-text-secondary block">
            Workspace Name
          </label>
          <input
            id="organizationName"
            type="text"
            required
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="Acme Corp"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>

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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          />
          <p className="text-[10px] text-text-tertiary mt-1">
            Must be at least 8 characters, contain an uppercase letter, a number, and a special character.
          </p>
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
          {loading ? 'Creating workspace…' : 'Sign up'}
        </Button>
        
        <div className="text-center mt-4">
          <p className="text-xs text-text-secondary">
            Already have an account?{' '}
            <Link href="/login" className="text-primary-400 hover:text-primary-300 transition-colors font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
