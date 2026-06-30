import Link from 'next/link';

export default function PricingPage() {
  const plans = [
    {
      name: 'Starter',
      price: 'Trial mode',
      description: 'Perfect for small teams getting started.',
      features: [
        'Basic CRM Profile Manager',
        'Customer 360 view (Timeline & Notes)',
        'Manual lead capture and log',
        'Single sales pipeline',
        'Up to 5 team members',
        'Email follow-up notifications'
      ]
    },
    {
      name: 'Growth',
      price: 'Billing pending',
      popular: true,
      description: 'For teams that want to automate sequences and prioritize deals.',
      features: [
        'AI Lead Scoring & Prioritization',
        'Visual workflow automation builder',
        'Automated follow-up sequences',
        'Instagram comment/DM auto-reply',
        'Up to 20 team members',
        'Pipeline forecasting & performance logs'
      ]
    },
    {
      name: 'Scale',
      price: 'Contact sales',
      description: 'Advanced capabilities for high-volume sales networks.',
      features: [
        'WhatsApp + Facebook Inbox Sync',
        'Tenant-Isolated AI Memory & custom keys',
        'Super Admin organization control panels',
        'Unlimited pipeline boards',
        'Custom webhooks and integrations',
        'Priority Slack/email support'
      ]
    }
  ];

  return (
    <div className="bg-[#fafafc] min-h-screen">
      {/* Header */}
      <section className="pt-24 pb-16 text-center bg-gradient-to-b from-white via-indigo-50/10 to-transparent">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6">
            Simple, transparent pricing.
          </h1>
          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-8">
            Start for free and experience the AI-powered operating system.
          </p>
          
          <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-amber-50 border border-amber-100 text-amber-800 text-sm font-semibold max-w-lg mx-auto">
            <span>⚠️</span>
            <span>Billing integration is currently pending. All teams can get started immediately in trial mode.</span>
          </div>
        </div>
      </section>

      {/* Cards Grid */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div 
                key={plan.name} 
                className={`p-8 rounded-3xl border flex flex-col justify-between ${
                  plan.popular 
                    ? 'bg-gradient-to-b from-indigo-50/50 to-white border-indigo-500/30 shadow-lg relative' 
                    : 'bg-white border-gray-150 shadow-sm hover:shadow-md transition-shadow'
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-sm">
                    Most Popular
                  </div>
                )}
                
                <div>
                  <div className="mb-6">
                    <h3 className="text-2xl font-extrabold text-gray-900 mb-2">{plan.name}</h3>
                    <p className="text-gray-400 text-xs leading-relaxed h-10">{plan.description}</p>
                  </div>
                  
                  <div className="mb-8 border-y border-gray-100 py-4">
                    <span className="text-3xl font-extrabold text-gray-900">{plan.price}</span>
                  </div>
                  
                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 text-gray-600 text-xs leading-relaxed">
                        <svg className="w-4.5 h-4.5 text-indigo-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{feature}</span>
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

      {/* FAQ / Info Section */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">Frequently Asked Questions</h2>
          <div className="grid md:grid-cols-2 gap-8 text-sm">
            <div>
              <h4 className="font-bold text-gray-900 mb-2">How does trial mode work?</h4>
              <p className="text-gray-500 leading-relaxed">
                When you create a workspace, you start automatically in Starter/Trial mode. You have access to core CRM profiles and manual pipelines to evaluate LeadOS before upgrading.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-2">When will billing go live?</h4>
              <p className="text-gray-500 leading-relaxed">
                Billing integrations are currently under review. Once enabled, you will be notified in your dashboard to choose a paid plan if you wish to upgrade from trial mode.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
