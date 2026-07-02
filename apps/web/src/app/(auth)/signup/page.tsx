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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!lastName.trim()) errors.lastName = 'Last name is required';
    if (!organizationName.trim()) errors.organizationName = 'Workspace name is required';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Valid email is required';
    
    if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    else if (!/[A-Z]/.test(password)) errors.password = 'Password must contain an uppercase letter';
    else if (!/[0-9]/.test(password)) errors.password = 'Password must contain a number';
    else if (!/[!@#$%^&*]/.test(password)) errors.password = 'Password must contain a special character (!@#$%^&*)';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

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
          details?: {
            fields?: Record<string, string>;
          };
        };
      };

      if (!res.ok || !json.success) {
        if (json.error?.details?.fields) {
          setFieldErrors(json.error.details.fields);
        }
        
        // Custom message for email already exists (usually 409 Conflict, or specific message from backend)
        const msg = json.error?.message ?? 'Registration failed. Please try again.';
        if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
           if (msg.toLowerCase().includes('email')) {
             setFieldErrors(prev => ({ ...prev, email: 'This email is already registered. Please sign in.' }));
             setError(null); // Don't show generic error if we have a field error
           } else if (msg.toLowerCase().includes('organization') || msg.toLowerCase().includes('workspace')) {
             setFieldErrors(prev => ({ ...prev, organizationName: 'Workspace name is already taken. Try another name.' }));
             setError(null);
           } else {
             setError(msg);
           }
        } else {
           // Only show generic error if we don't have field errors to show
           if (!json.error?.details?.fields || Object.keys(json.error.details.fields).length === 0) {
             setError(msg);
           }
        }
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
      <div className="bg-bg-elevated border border-border-strong rounded-2xl p-8 space-y-6 text-center shadow-xl shadow-primary-900/10 backdrop-blur-xl">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.2)]">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-text-primary">Registration Successful!</h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          Your workspace has been created. Please check your email to verify your account, then sign in.
        </p>
        <Link href="/login" className="block mt-4 text-primary-400 hover:text-primary-300 text-sm font-semibold transition-colors">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-bg-elevated border border-border-strong rounded-2xl p-8 space-y-6 shadow-xl shadow-primary-900/10 backdrop-blur-xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent pointer-events-none" />

      <div className="space-y-1 relative z-10">
        <p className="text-xs font-bold text-primary-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
          LeadOS
        </p>
        <h1 className="text-xl font-bold text-text-primary">Create your workspace</h1>
        <p className="text-sm text-text-secondary">Get started with LeadOS in seconds</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="firstName" className="text-xs font-semibold text-text-secondary block">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className={`w-full px-3 py-2 text-sm bg-bg-overlay border rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all ${fieldErrors.firstName ? 'border-rose-500 focus:border-rose-400' : 'border-border-default focus:border-primary-500'}`}
            />
            {fieldErrors.firstName && <p className="text-xs text-rose-400 mt-1">{fieldErrors.firstName}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lastName" className="text-xs font-semibold text-text-secondary block">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              className={`w-full px-3 py-2 text-sm bg-bg-overlay border rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all ${fieldErrors.lastName ? 'border-rose-500 focus:border-rose-400' : 'border-border-default focus:border-primary-500'}`}
            />
            {fieldErrors.lastName && <p className="text-xs text-rose-400 mt-1">{fieldErrors.lastName}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="organizationName" className="text-xs font-semibold text-text-secondary block">
            Workspace Name
          </label>
          <input
            id="organizationName"
            type="text"
            required
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="Acme Corp"
            className={`w-full px-3 py-2 text-sm bg-bg-overlay border rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all ${fieldErrors.organizationName ? 'border-rose-500 focus:border-rose-400' : 'border-border-default focus:border-primary-500'}`}
          />
          {fieldErrors.organizationName && <p className="text-xs text-rose-400 mt-1">{fieldErrors.organizationName}</p>}
        </div>

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
            className={`w-full px-3 py-2 text-sm bg-bg-overlay border rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all ${fieldErrors.email ? 'border-rose-500 focus:border-rose-400' : 'border-border-default focus:border-primary-500'}`}
          />
          {fieldErrors.email && <p className="text-xs text-rose-400 mt-1">{fieldErrors.email}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold text-text-secondary block">
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
            className={`w-full px-3 py-2 text-sm bg-bg-overlay border rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all ${fieldErrors.password ? 'border-rose-500 focus:border-rose-400' : 'border-border-default focus:border-primary-500'}`}
          />
          {fieldErrors.password ? (
            <p className="text-xs text-rose-400 mt-1">{fieldErrors.password}</p>
          ) : (
            <p className="text-[10px] text-text-tertiary mt-1">
              Must be at least 8 characters, contain an uppercase letter, a number, and a special character.
            </p>
          )}
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
          {loading ? 'Creating workspace…' : 'Sign up'}
        </Button>
        
        <div className="text-center mt-4">
          <p className="text-xs text-text-tertiary">
            Already have an account?{' '}
            <Link href="/login" className="text-primary-400 hover:text-primary-300 transition-colors font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
