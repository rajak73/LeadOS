import Link from 'next/link';

export default function MarketingPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative pt-32 pb-40 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
            <span className="text-sm font-medium text-white/80">LeadOS 2.0 is now live</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-8">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-indigo-400">
              AI-Powered
            </span>
            <br className="hidden md:block" />
            Revenue Operating System
          </h1>
          
          <p className="text-xl text-white/50 mb-12 max-w-2xl mx-auto leading-relaxed">
            The multi-organization CRM for social lead capture, AI scoring, pipeline tracking, and automated follow-ups. Everything you need to close more deals, beautifully designed.
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <Link 
              href="/signup" 
              className="h-12 px-8 flex items-center justify-center rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-colors shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_60px_rgba(255,255,255,0.3)] duration-500"
            >
              Start for free
            </Link>
            <Link 
              href="#features" 
              className="h-12 px-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 font-semibold hover:bg-white/10 transition-colors"
            >
              See how it works
            </Link>
          </div>
        </div>

        {/* Hero Image Mockup */}
        <div className="max-w-6xl mx-auto px-6 mt-24 relative z-10">
          <div className="rounded-2xl border border-white/10 bg-[#0a0a0f] p-2 shadow-2xl">
            <div className="rounded-xl overflow-hidden border border-white/5 bg-[#0d0d12] aspect-video relative flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 to-transparent" />
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary-600 to-indigo-500 mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-primary-500/20">
                  <svg className="w-8 h-8 text-white fill-current" viewBox="0 0 24 24">
                    <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-white/80">Beautiful, fast, inside and out.</h3>
                <p className="text-white/40 mt-2">Sign in to experience the dashboard.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Built for speed. Designed for growth.</h2>
            <p className="text-xl text-white/50 max-w-2xl mx-auto">
              We replaced cluttered interfaces with keyboard shortcuts, AI automation, and an uncompromised user experience.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.07] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">AI Lead Scoring</h3>
              <p className="text-white/50 leading-relaxed">
                Automatically prioritize leads based on buying intent and engagement, so your team focuses on what matters.
              </p>
            </div>
            
            <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.07] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Omnichannel Inbox</h3>
              <p className="text-white/50 leading-relaxed">
                Manage WhatsApp, Instagram DMs, and emails in a single unified inbox. Never miss a message again.
              </p>
            </div>
            
            <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.07] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Visual Workflows</h3>
              <p className="text-white/50 leading-relaxed">
                Automate repetitive tasks with our powerful visual builder. Trigger actions when deals move stages.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-32 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary-900/20" />
        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-8">Ready to transform your sales?</h2>
          <Link 
            href="/signup" 
            className="inline-flex h-14 px-10 items-center justify-center rounded-xl bg-white text-black font-bold text-lg hover:bg-white/90 transition-all hover:scale-105 duration-300"
          >
            Create your workspace
          </Link>
          <p className="text-white/40 mt-6">No credit card required. Free 14-day trial.</p>
        </div>
      </section>
    </div>
  );
}
