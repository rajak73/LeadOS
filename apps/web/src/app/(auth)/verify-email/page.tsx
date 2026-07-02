'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing verification token. Please check your email link.');
      return;
    }

    if (hasAttempted.current) return;
    hasAttempted.current = true;

    async function verify() {
      try {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        
        if (!res.ok || !data.success) {
          setStatus('error');
          setErrorMessage(data.error?.message || 'Invalid or expired verification token.');
          return;
        }

        setStatus('success');
      } catch {
        setStatus('error');
        setErrorMessage('Unable to reach the server. Please try again later.');
      }
    }

    verify();
  }, [token]);

  return (
    <div className="bg-bg-elevated border border-border rounded-xl p-8 max-w-md w-full mx-auto text-center space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-primary-400 uppercase tracking-widest mb-3">LeadOS</p>
        <h1 className="text-2xl font-semibold text-text-primary">Email Verification</h1>
      </div>

      {status === 'loading' && (
        <div className="py-8 space-y-4">
          <Spinner size="lg" className="mx-auto" />
          <p className="text-sm text-text-secondary">Verifying your email address...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="py-4 space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-text-primary">Email Verified Successfully</h2>
            <p className="text-sm text-text-secondary">
              Thank you for verifying your email. You can now access your workspace.
            </p>
          </div>
          <Link href="/login" className="block">
            <Button variant="primary" className="w-full justify-center">
              Go to Sign In
            </Button>
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="py-4 space-y-6">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-text-primary">Verification Failed</h2>
            <p className="text-sm text-red-400">{errorMessage}</p>
          </div>
          <Link href="/login" className="block">
            <Button variant="secondary" className="w-full justify-center">
              Return to Sign In
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="bg-bg-elevated border border-border rounded-xl p-8 max-w-md w-full mx-auto text-center space-y-6">
        <Spinner size="lg" className="mx-auto" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
