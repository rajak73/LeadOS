import type { ReactNode } from 'react';

// Public (unauthenticated) route group shell. Auth screens land in Sprint 2.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <main className="w-full max-w-md p-8">{children}</main>
    </div>
  );
}
