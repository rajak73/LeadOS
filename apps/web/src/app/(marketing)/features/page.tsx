import Link from 'next/link';

export default function FeaturesPage() {
  const mainFeatures = [
    {
      title: 'Customer 360 Profile Manager',
      desc: 'A unified view of every customer, lead, and interaction in one place. See past chats, active deals, custom notes, and scheduled actions instantly.',
      badge: 'CRM Core',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    },
    {
      title: 'Lead Pipeline & Conversion Tracker',
      desc: 'Track and manage your deals with a visual drag-and-drop board. Configure stages, define probabilities, and accurately forecast your pipeline revenue.',
      badge: 'Sales Ops',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      title: 'AI Lead Scoring & Prioritization',
      desc: 'Automatically evaluate incoming leads based on intent, conversation velocity, and organization relevance. Filter and focus only on hot deals.',
      badge: 'Artificial Intelligence',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    {
      title: 'Automated Follow-up Builder',
      desc: 'Design complex messaging sequences visually. Build conditional check paths, wait times, and configure safe auto-stop criteria once a lead replies.',
      badge: 'Workflow automation',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      )
    },
    {
      title: 'Instagram Auto-Reply & Capture',
      desc: 'Connect Instagram Business profiles to monitor post comments and DMs. Instantly identify new users, send links, and capture emails.',
      badge: 'Social capture',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      title: 'WhatsApp + Messenger Inbox',
      desc: 'Direct WhatsApp and Facebook messages into the exact same dashboard feed. Share conversations across your team with clear owner assignments.',
      badge: 'Inbox Sync',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    },
    {
      title: 'Multi-Tenant Isolation Security',
      desc: 'Built from the ground up for strict security. Tenant-isolated schemas, database roles, and end-to-end memory isolation safeguard your data.',
      badge: 'Security',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    },
    {
      title: 'Super Admin Control Center',
      desc: 'Empower super-organizations to monitor system execution, suspend violating tenants, configure plans, and oversee database health.',
      badge: 'Management',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      title: 'Analytics & Revenue Forecast',
      desc: 'Keep track of conversion rates, historical deals, agent response times, and identify bottlenecks in your workflow executions.',
      badge: 'Analytics',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    }
  ];

  return (
    <div className="bg-[#fafafc]">
      {/* Hero */}
      <section className="pt-24 pb-16 text-center bg-gradient-to-b from-white via-indigo-50/10 to-transparent">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6">
            Features built to drive customer acquisition.
          </h1>
          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            From social lead capture to automated follow-up sequences and secure multi-tenant CRM profiles, LeadOS provides everything you need in one operating system.
          </p>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {mainFeatures.map((feat, i) => (
              <div 
                key={i} 
                className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      {feat.icon}
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md uppercase tracking-wider">
                      {feat.badge}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{feat.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed mb-6">
                    {feat.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* In-depth details section */}
      <section id="solutions" className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900">How LeadOS Solves Social Selling</h2>
            <p className="text-gray-500 mt-2">No more lost messages or manual contact copy-pasting.</p>
          </div>

          <div className="space-y-16">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">1. Auto-Capture & Segment</h3>
                <p className="text-gray-600 leading-relaxed">
                  As soon as a prospect comments on a designated Instagram post or initiates a WhatsApp chat, LeadOS identifies them, initiates an automated conversation block, captures contact details, and logs a structured deal profile.
                </p>
              </div>
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest block mb-4">Live Execution</span>
                <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm text-xs space-y-2">
                  <p className="text-gray-400">Comment: "Info please!"</p>
                  <p className="text-emerald-600 font-semibold">✓ Automated trigger matched</p>
                  <p className="text-gray-700">Message sent: "Hey! We've sent a DM to collect your details."</p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="md:order-2">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">2. AI Prioritization</h3>
                <p className="text-gray-600 leading-relaxed">
                  Avoid wasting agent time on spam or low-intent queries. Our AI engine scores incoming leads based on keywords, response rate, profile details, and schedules alerts for high-value leads automatically.
                </p>
              </div>
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 md:order-1">
                <span className="text-xs font-bold text-orange-600 uppercase tracking-widest block mb-4">AI Score Card</span>
                <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm text-xs text-center space-y-2">
                  <div className="text-3xl font-extrabold text-orange-600">89 / 100</div>
                  <p className="font-bold text-gray-800">Priority: HOT LEAD</p>
                  <p className="text-gray-400">Recommendation: Call agent within 10 minutes</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 text-center border-t border-gray-100 bg-[#fafafc]">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-8">Ready to explore LeadOS?</h2>
          <div className="flex justify-center gap-4">
            <Link 
              href="/signup" 
              className="inline-flex h-12 px-8 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all duration-200"
            >
              Start Free Trial
            </Link>
            <Link 
              href="/pricing" 
              className="inline-flex h-12 px-8 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-all duration-200"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
