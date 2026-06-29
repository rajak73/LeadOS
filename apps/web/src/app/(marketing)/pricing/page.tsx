import Link from 'next/link';

export default function PricingPage() {
  const plans = [
    {
      name: 'Starter',
      price: 'Trial mode',
      description: 'Perfect for small teams getting started.',
      features: [
        'Basic CRM',
        'Customer 360',
        'Manual lead capture',
        'Basic pipeline',
        'Team workspace'
      ]
    },
    {
      name: 'Growth',
      price: 'Billing pending',
      popular: true,
      description: 'For teams that want to automate and scale.',
      features: [
        'AI lead scoring',
        'Follow-up sequences',
        'Social inbox simulation',
        'Team member roles',
        'Pipeline analytics'
      ]
    },
    {
      name: 'Scale',
      price: 'Contact sales',
      description: 'Advanced capabilities for high-volume teams.',
      features: [
        'Advanced automation',
        'Instagram/WhatsApp/FB ready',
        'Super admin controls',
        'Advanced analytics',
        'Priority support'
      ]
    }
  ];

  return (
    <div className="pt-32 pb-24 max-w-7xl mx-auto px-6">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Simple, transparent pricing.</h1>
        <p className="text-xl text-white/50 max-w-2xl mx-auto mb-6">
          Start for free, upgrade when you need to.
        </p>
        
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20">
          <span className="text-blue-400">ℹ️</span>
          <span className="text-sm font-medium text-blue-200">Billing integration pending. Trial onboarding is available.</span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan) => (
          <div 
            key={plan.name} 
            className={`p-8 rounded-3xl border flex flex-col ${
              plan.popular 
                ? 'bg-gradient-to-b from-primary-900/40 to-bg-base border-primary-500/50 shadow-2xl shadow-primary-500/20 relative' 
                : 'bg-white/5 border-white/10 hover:bg-white/[0.07] transition-colors'
            }`}
          >
            {plan.popular && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-primary-500 text-white text-xs font-bold uppercase tracking-wider rounded-full">
                Most Popular
              </div>
            )}
            
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <p className="text-white/50 text-sm h-10">{plan.description}</p>
            </div>
            
            <div className="mb-8">
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold">{plan.price}</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-white/80">
                  <svg className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            
            <Link 
              href="/signup" 
              className={`w-full h-12 flex items-center justify-center rounded-xl font-semibold transition-colors ${
                plan.popular
                  ? 'bg-primary-600 hover:bg-primary-500 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              Start Free Trial
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
