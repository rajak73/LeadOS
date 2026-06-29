import { type ReactNode } from 'react';
import Link from 'next/link';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-primary-500/30 font-sans">
      <nav className="fixed top-0 left-0 right-0 h-20 border-b border-white/5 bg-[#050508]/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-primary-500/20 group-hover:shadow-primary-500/40 transition-shadow duration-300">
                <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                  <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-wide">
                Lead<span className="text-primary-400">OS</span>
              </span>
            </Link>
            
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
              <Link href="#features" className="hover:text-white transition-colors">Features</Link>
              <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="#customers" className="hover:text-white transition-colors">Customers</Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link 
              href="/signup" 
              className="text-sm font-medium bg-white text-black px-4 py-2 rounded-lg hover:bg-white/90 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {children}
      </main>

      <footer className="border-t border-white/5 py-12 mt-32">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white fill-current" viewBox="0 0 24 24">
                  <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
                </svg>
              </div>
              <span className="font-bold tracking-wide text-sm">LeadOS</span>
            </div>
            <p className="text-sm text-white/50">
              The modern operating system for your sales team.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-4">Product</h4>
            <ul className="space-y-3 text-sm text-white/50">
              <li><Link href="#" className="hover:text-white transition-colors">Features</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Integrations</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-4">Company</h4>
            <ul className="space-y-3 text-sm text-white/50">
              <li><Link href="#" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-4">Legal</h4>
            <ul className="space-y-3 text-sm text-white/50">
              <li><Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="#" className="hover:text-white transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
