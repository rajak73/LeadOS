import type { ReactNode } from 'react';

// Public (unauthenticated) route group shell. Auth screens land in Sprint 2.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base text-text-primary antialiased selection:bg-primary-500/20 font-sans relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/10 blur-[100px] rounded-full pointer-events-none" />
      <main className="w-full max-w-md p-8 relative z-10">{children}</main>
    </div>
  );
}
