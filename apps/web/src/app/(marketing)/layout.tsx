import { type ReactNode } from 'react';
import Link from 'next/link';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafafc] text-gray-900 selection:bg-indigo-500/20 font-sans antialiased">
      {/* Sticky Top Navbar */}
      <nav className="fixed top-0 left-0 right-0 h-20 border-b border-gray-100 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/10 group-hover:shadow-indigo-500/20 transition-all duration-300">
                <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                  <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">
                Lead<span className="text-indigo-600">OS</span>
              </span>
            </Link>
            
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
              <Link href="/features" className="hover:text-indigo-600 transition-colors">Products</Link>
              <Link href="/features#solutions" className="hover:text-indigo-600 transition-colors">Solutions</Link>
              <Link href="/pricing" className="hover:text-indigo-600 transition-colors">Pricing</Link>
              <Link href="/customers" className="hover:text-indigo-600 transition-colors">Customers</Link>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <Link 
              href="/login" 
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign In
            </Link>
            <Link 
              href="/signup" 
              className="text-sm font-semibold bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-all hover:shadow-lg hover:shadow-indigo-500/15 duration-200"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-16 mt-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-orange-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <svg className="w-3.5 h-3.5 text-white fill-current" viewBox="0 0 24 24">
                    <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
                  </svg>
                </div>
                <span className="font-bold tracking-tight text-base text-gray-900">LeadOS</span>
              </div>
              <p className="text-sm text-gray-500 max-w-sm leading-relaxed mb-4">
                LeadOS — The AI-powered revenue operating system for modern customer acquisition. Unifying conversations, customer intelligence, and pipelines.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-900 mb-4">Product</h4>
              <ul className="space-y-3 text-sm text-gray-500">
                <li><Link href="/features" className="hover:text-indigo-600 transition-colors">Features</Link></li>
                <li><Link href="/features#integrations" className="hover:text-indigo-600 transition-colors">Integrations</Link></li>
                <li><Link href="/pricing" className="hover:text-indigo-600 transition-colors">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-900 mb-4">Company</h4>
              <ul className="space-y-3 text-sm text-gray-500">
                <li><Link href="/about" className="hover:text-indigo-600 transition-colors">About Us</Link></li>
                <li><Link href="/careers" className="hover:text-indigo-600 transition-colors">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-indigo-600 transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-900 mb-4">Legal</h4>
              <ul className="space-y-3 text-sm text-gray-500">
                <li><Link href="/privacy" className="hover:text-indigo-600 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-indigo-600 transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              © {new Date().getFullYear()} LeadOS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

