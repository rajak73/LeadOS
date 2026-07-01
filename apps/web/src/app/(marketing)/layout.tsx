import { type ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/server/cookies';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME);
  return (
    <div className="min-h-screen bg-bg-base text-text-primary selection:bg-primary-500/20 font-sans antialiased">
      {/* Sticky Top Navbar */}
      <nav className="fixed top-0 left-0 right-0 h-20 border-b border-border-subtle bg-bg-base/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/10 group-hover:shadow-indigo-500/20 transition-all duration-300">
                <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                  <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight text-text-primary">
                Lead<span className="text-primary-500">OS</span>
              </span>
            </Link>
            
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-text-secondary">
              <Link href="/features" className="hover:text-primary-400 transition-colors">Products</Link>
              <Link href="/features#solutions" className="hover:text-primary-400 transition-colors">Solutions</Link>
              <Link href="/pricing" className="hover:text-primary-400 transition-colors">Pricing</Link>
              <Link href="/customers" className="hover:text-primary-400 transition-colors">Customers</Link>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {hasSession ? (
              <Link 
                href="/dashboard" 
                className="text-sm font-semibold bg-primary-600 text-white px-5 py-2.5 rounded-xl hover:bg-primary-500 transition-all hover:shadow-lg hover:shadow-primary-500/15 duration-200"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link 
                  href="/login" 
                  className="text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
                >
                  Sign In
                </Link>
                <Link 
                  href="/signup" 
                  className="text-sm font-semibold bg-primary-600 text-white px-5 py-2.5 rounded-xl hover:bg-primary-500 transition-all hover:shadow-lg hover:shadow-primary-500/15 duration-200"
                >
                  Get Started Free
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-bg-base border-t border-border-default py-16 mt-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-orange-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <svg className="w-3.5 h-3.5 text-white fill-current" viewBox="0 0 24 24">
                    <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
                  </svg>
                </div>
                <span className="font-bold tracking-tight text-base text-text-primary">LeadOS</span>
              </div>
              <p className="text-sm text-text-secondary max-w-sm leading-relaxed mb-4">
                LeadOS — The AI-powered revenue operating system for modern customer acquisition. Unifying conversations, customer intelligence, and pipelines.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-text-primary mb-4">Product</h4>
              <ul className="space-y-3 text-sm text-text-secondary">
                <li><Link href="/features" className="hover:text-primary-400 transition-colors">Features</Link></li>
                <li><Link href="/features#integrations" className="hover:text-primary-400 transition-colors">Integrations</Link></li>
                <li><Link href="/pricing" className="hover:text-primary-400 transition-colors">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-text-primary mb-4">Company</h4>
              <ul className="space-y-3 text-sm text-text-secondary">
                <li><Link href="/about" className="hover:text-primary-400 transition-colors">About Us</Link></li>
                <li><Link href="/careers" className="hover:text-primary-400 transition-colors">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-primary-400 transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-text-primary mb-4">Legal</h4>
              <ul className="space-y-3 text-sm text-text-secondary">
                <li><Link href="/privacy" className="hover:text-primary-400 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-primary-400 transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border-subtle pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-text-tertiary">
              © {new Date().getFullYear()} LeadOS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
