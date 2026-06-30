import Link from 'next/link';

export default function MarketingPage() {
  const genericSegments = [
    { name: 'Real Estate Teams', desc: 'Auto-reply to listing queries and capture contact info.' },
    { name: 'Clinics', desc: 'Schedule appointments and manage patient follow-ups.' },
    { name: 'Agencies', desc: 'Track client pipelines from first inquiry to retainer.' },
    { name: 'Education Teams', desc: 'Nurture student inquiries automatically via DM.' },
    { name: 'Local Services', desc: 'Convert local conversation traffic into scheduled bookings.' },
    { name: 'SaaS Startups', desc: 'Sync customer conversation histories to CRM profiles.' },
  ];

  const platforms = [
    {
      title: 'Marketing Inbox',
      desc: 'Consolidate Instagram DMs, WhatsApp, and Facebook chats into one feed.',
      color: 'from-blue-500 to-indigo-500',
    },
    {
      title: 'Sales Pipeline',
      desc: 'Visually track deals through custom pipeline stages with revenue forecasting.',
      color: 'from-orange-500 to-amber-500',
    },
    {
      title: 'Customer 360',
      desc: 'See the full context of every lead, including messages, notes, and activity logs.',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      title: 'Automation Builder',
      desc: 'Build conditional follow-up sequences visually with safe stop triggers.',
      color: 'from-violet-500 to-purple-500',
    },
    {
      title: 'AI Lead Scoring',
      desc: 'Prioritize hot deals automatically based on buying intent and engagement.',
      color: 'from-rose-500 to-pink-500',
    },
    {
      title: 'Revenue Analytics',
      desc: 'Monitor team performance, conversion rates, and pipeline health in real time.',
      color: 'from-sky-500 to-cyan-500',
    },
  ];

  const aiAgents = [
    {
      role: 'Sales Agent',
      desc: 'Qualifies incoming social leads, gathers contact info, and logs them to the pipeline.',
      badge: 'Capture',
    },
    {
      role: 'Follow-up Agent',
      desc: 'Nurtures cold leads with automated, context-aware sequence messages.',
      badge: 'Nurture',
    },
    {
      role: 'Support Agent',
      desc: 'Resolves common FAQs and handles billing queries 24/7.',
      badge: 'Resolve',
    },
    {
      role: 'CRM Agent',
      desc: 'Enriches lead profiles and automatically labels organizations based on behavior.',
      badge: 'Data',
    },
    {
      role: 'Analytics Agent',
      desc: 'Forecasts monthly recurring revenue and flags slipping deals early.',
      badge: 'Insights',
    },
    {
      role: 'Social Inbox Agent',
      desc: 'Replies to comments and coordinates seamless human-agent handoffs.',
      badge: 'Inbox',
    },
  ];

  const socialFeatures = [
    { title: 'Auto-Replies', desc: 'Trigger instant customized replies based on keywords or comments.' },
    { title: 'Lead Identification', desc: 'Identify whether an incoming sender is a new prospect or existing customer.' },
    { title: 'New Customer Capture', desc: 'Capture name, email, and requirements during the chat flow.' },
    { title: 'Existing Recognition', desc: 'Link incoming messages directly to existing CRM profiles.' },
    { title: 'Conversation History', desc: 'Access unified cross-channel chat logs in a single timeline.' },
    { title: 'Human Handoff', desc: 'Pause auto-replies and assign conversations to agents instantly.' },
  ];

  return (
    <div className="bg-[#fafafc] overflow-hidden">
      {/* 1. Hero Section */}
      <section className="relative pt-24 pb-20 md:pt-36 md:pb-32 bg-gradient-to-b from-white via-indigo-50/20 to-transparent">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[500px] h-[500px] bg-orange-400/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
            <span className="text-xs font-semibold text-indigo-700 tracking-wide uppercase">AI Revenue Operations</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900 mb-8 max-w-4xl mx-auto leading-[1.1]">
            Where revenue teams turn{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-purple-600 to-indigo-600">
              conversations
            </span>{' '}
            into customers.
          </h1>

          <p className="text-lg md:text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
            LeadOS unifies customer profiles, social conversations, AI lead scoring, pipeline tracking, and automated
            follow-ups for every organization in one secure workspace.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto h-14 px-8 flex items-center justify-center rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all hover:shadow-lg hover:shadow-indigo-500/20 duration-200"
            >
              Get started free
            </Link>
            <Link
              href="#platform"
              className="w-full sm:w-auto h-14 px-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-all duration-200"
            >
              See how it works
            </Link>
          </div>

          <p className="text-xs text-gray-400 mt-6 font-medium">
            No credit card required. Built for modern sales teams.
          </p>
        </div>

        {/* Product Visual Mockup */}
        <div className="max-w-6xl mx-auto px-6 mt-20 relative z-10">
          <div className="rounded-2xl border border-gray-200/80 bg-white p-3 shadow-xl shadow-indigo-900/5">
            <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 aspect-video relative flex flex-col items-center justify-center p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-orange-500/5" />
              <div className="relative text-center max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-500 to-indigo-600 mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <svg className="w-8 h-8 text-white fill-current" viewBox="0 0 24 24">
                    <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Beautiful, fast, inside and out.</h3>
                <p className="text-gray-500 mt-2">Sign in to experience the visual dashboard.</p>
                <div className="mt-8 flex justify-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-orange-500" />
                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-500" />
                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Generic Segments / Social Proof Section */}
      <section className="py-16 border-y border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-10">
            Trusted by modern sales networks and growing industries
          </p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
            {genericSegments.map((seg, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/10 transition-all text-center group"
              >
                <span className="text-sm font-bold text-gray-700 group-hover:text-indigo-600 transition-colors">
                  {seg.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Product Platform Section */}
      <section id="platform" className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-6">
              Everything your revenue team needs in one operating system.
            </h2>
            <p className="text-lg md:text-xl text-gray-500 max-w-3xl mx-auto leading-relaxed">
              Consolidate tools, automate repetitive flows, and build rich intelligence with our modular architecture.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {platforms.map((plat, i) => (
              <div
                key={i}
                className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${plat.color} text-white flex items-center justify-center mb-6 shadow-sm`}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{plat.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{plat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. AI Agents Section */}
      <section className="py-24 md:py-32 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-6">
              Built-in AI agents that work for your team 24/7.
            </h2>
            <p className="text-lg md:text-xl text-gray-500 max-w-3xl mx-auto leading-relaxed">
              Enable secure, tenant-isolated AI agents designed to automate customer interactions, qualify deals, and analyze data safely.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {aiAgents.map((agent, i) => (
              <div
                key={i}
                className="bg-gray-50/50 p-8 rounded-2xl border border-gray-100 flex flex-col justify-between hover:bg-white hover:shadow-md hover:border-gray-200 transition-all duration-300"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-lg font-bold text-gray-900">{agent.role}</span>
                    <span className="px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full">
                      {agent.badge}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm leading-relaxed">{agent.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Social Lead Capture Section */}
      <section className="py-24 md:py-32 bg-gradient-to-b from-white to-[#fafafc]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-6 leading-tight">
                Capture and convert leads from Instagram, WhatsApp, and Facebook.
              </h2>
              <p className="text-lg text-gray-500 mb-10 leading-relaxed">
                Connect your social accounts securely. Automate keyword responses, collect visitor emails in real time, and route conversions straight to CRM pipelines.
              </p>

              <div className="grid sm:grid-cols-2 gap-6">
                {socialFeatures.map((feat, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900">{feat.title}</h4>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-orange-500/10 rounded-3xl blur-2xl pointer-events-none" />
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-lg relative z-10">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-6 mb-6">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                    IG
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-gray-900">Instagram Automation</h4>
                    <p className="text-xs text-gray-400">Activity State: Auto-reply Active</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-end">
                    <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 text-sm max-w-xs leading-relaxed">
                      "I commented on your post! Can I get the link?"
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-700 rounded-2xl rounded-tl-none px-4 py-2.5 text-sm max-w-xs leading-relaxed">
                      "Hi there! Sure thing. Can we get your email to send the details?"
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 text-sm max-w-xs leading-relaxed font-medium">
                      "Yes, my email is hello@example.com"
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-indigo-50 text-indigo-700 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-2 border border-indigo-100">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                      Lead created in CRM with Hot Score.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Customer 360 Section */}
      <section className="py-24 md:py-32 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-7 bg-gray-50 rounded-2xl border border-gray-100 p-8 shadow-sm">
              <div className="flex justify-between items-center mb-8 border-b border-gray-200/60 pb-4">
                <span className="font-bold text-gray-900">Customer 360 Profile</span>
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold uppercase">
                  Hot Lead
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-8 text-sm">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Identity</h4>
                  <p className="font-bold text-gray-900">Sarah Jenkins</p>
                  <p className="text-gray-500 text-xs mt-0.5">sarah@jenkinsgroup.com</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Assigned Agent</h4>
                  <p className="font-bold text-gray-700">Alex Rivera</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Recent Timeline</h4>
                  <ul className="space-y-2 mt-2 text-xs text-gray-600">
                    <li className="flex gap-2">
                      <span className="text-indigo-600 font-bold">•</span> Inbound Instagram DM received
                    </li>
                    <li className="flex gap-2">
                      <span className="text-indigo-600 font-bold">•</span> AI Lead Scoring calculated (Score: 92)
                    </li>
                    <li className="flex gap-2">
                      <span className="text-indigo-600 font-bold">•</span> Sequence "SaaS Intro" triggered
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Next Scheduled Action</h4>
                  <p className="font-bold text-orange-600">Follow-up Call (Tomorrow, 10 AM)</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-6 leading-tight">
                Know every customer before you reply.
              </h2>
              <p className="text-lg text-gray-500 leading-relaxed">
                Empower your agents with the complete historical customer context. View message histories, active deals, timeline logs, and custom fields in one central dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Pipeline Section */}
      <section className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-6">
            Track every deal from first message to won revenue.
          </h2>
          <p className="text-lg text-gray-500 max-w-3xl mx-auto mb-16 leading-relaxed">
            Drag and drop leads through stages, automatically trigger webhook events, and watch your pipeline grow.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
              { stage: 'New Lead', count: 18, color: 'border-l-blue-500' },
              { stage: 'Contacted', count: 12, color: 'border-l-indigo-500' },
              { stage: 'Qualified', count: 8, color: 'border-l-purple-500' },
              { stage: 'Proposal Sent', count: 5, color: 'border-l-pink-500' },
              { stage: 'Negotiation', count: 3, color: 'border-l-orange-500' },
              { stage: 'Won', count: 24, color: 'border-l-emerald-500' },
            ].map((col, i) => (
              <div
                key={i}
                className={`bg-white p-5 rounded-xl border border-gray-150 border-l-4 ${col.color} text-left shadow-sm`}
              >
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{col.stage}</h4>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-gray-800">{col.count}</span>
                  <span className="text-xs text-gray-400 font-medium">Deals</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Pricing Section */}
      <section id="pricing" className="py-24 md:py-32 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-6">
              Simple, transparent plans.
            </h2>
            <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-8">
              Start on our free trial and grow. Billing integrations are currently pending.
            </p>
            <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-amber-50 border border-amber-100 text-amber-800 text-sm font-semibold">
              <span>⚠️</span>
              <span>Billing integration is currently pending. Teams can start in trial mode.</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: 'Starter',
                price: '$0',
                period: '14-day free trial',
                desc: 'Perfect for small teams getting started.',
                features: ['Basic CRM Profiles', 'Customer 360 View', 'Manual Lead Capture', 'Single Pipeline', '5 Team Members'],
              },
              {
                name: 'Growth',
                price: '$29',
                period: 'per month',
                desc: 'For teams that want to automate workflows.',
                popular: true,
                features: ['AI Lead Scoring', 'Visual Flow sequences', 'Auto-Reply Integrations', 'Workspace Customization', '20 Team Members'],
              },
              {
                name: 'Scale',
                price: '$99',
                period: 'per month',
                desc: 'Advanced controls for high-volume sales networks.',
                features: ['Multi-channel auto-capture', 'Super Admin controls', 'Custom webhooks', 'Full Revenue Analytics', 'Priority Slack support'],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`p-8 rounded-3xl border flex flex-col justify-between ${
                  plan.popular
                    ? 'bg-gradient-to-b from-indigo-50/50 to-white border-indigo-500/30 shadow-lg relative'
                    : 'bg-white border-gray-150'
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-sm">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="mb-6">
                    <h3 className="text-xl font-extrabold text-gray-900 mb-1">{plan.name}</h3>
                    <p className="text-gray-400 text-xs leading-relaxed">{plan.desc}</p>
                  </div>

                  <div className="mb-6 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-gray-900">{plan.price}</span>
                    <span className="text-xs font-medium text-gray-400">/ {plan.period}</span>
                  </div>

                  <ul className="space-y-3.5 mb-8">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex gap-2.5 items-start text-xs text-gray-600">
                        <svg className="w-4.5 h-4.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/signup"

                  className={`w-full h-12 flex items-center justify-center rounded-xl font-bold text-sm transition-all duration-200 ${
                    plan.popular
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-md hover:shadow-indigo-500/10'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Final CTA */}
      <section className="py-24 md:py-32 relative text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-50/20" />
        <div className="max-w-4xl mx-auto px-6 relative z-10">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6 leading-tight">
            Ready to turn more conversations into revenue?
          </h2>
          <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto">
            Get started today on our trial mode. Invite your team, connect your channels, and close deals faster.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto h-14 px-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition-all hover:scale-105 duration-200"
            >
              Create your workspace
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto h-14 px-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-lg hover:bg-gray-50 transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
