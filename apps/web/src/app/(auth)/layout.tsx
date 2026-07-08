import type { ReactNode } from 'react';
import Link from 'next/link';

// Public (unauthenticated) route group shell. Auth screens land in Sprint 2.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased selection:bg-primary-500/20 font-sans relative overflow-hidden">
      {/* Top Navbar */}
      <nav className="fixed top-0 left-0 right-0 h-20 border-b border-slate-200 bg-slate-50/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/10 group-hover:shadow-indigo-500/20 transition-all duration-300">
              <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Lead<span className="text-primary-500">OS</span>
            </span>
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 blur-[100px] rounded-full pointer-events-none" />
        <main className="w-full max-w-md p-8 relative z-10 mt-10">{children}</main>
      </div>
    </div>
  );
}
