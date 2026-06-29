import { type ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#08080c] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      
      <header className="absolute top-0 left-0 right-0 h-20 flex items-center px-8 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
              <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-white tracking-wide">
            Lead<span className="text-primary-400">OS</span>
          </span>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-2xl px-4 py-20">
        {children}
      </main>
    </div>
  );
}
