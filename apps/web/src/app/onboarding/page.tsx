'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

type Step = 'welcome' | 'industry' | 'teamSize' | 'goals' | 'crm' | 'invites' | 'import' | 'channels' | 'plan';

export default function OnboardingWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);

  // Form State
  const [industry, setIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [goal, setGoal] = useState('');
  const [crmPreference, setCrmPreference] = useState('');
  const [plan, setPlan] = useState('');

  async function handleFinish() {
    setLoading(true);
    try {
      // We update the organization with the industry
      // The other fields are UX enhancements for the wizard
      if (industry) {
        await fetch('/api/v1/organizations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ industry }),
        });
      }
      router.replace('/dashboard');
    } catch (e) {
      console.error('Failed to update organization', e);
      router.replace('/dashboard'); // still let them in
    } finally {
      setLoading(false);
    }
  }

  const renderWelcome = () => (
    <div className="text-center space-y-6">
      <h1 className="text-4xl font-bold text-white tracking-tight">Welcome to LeadOS</h1>
      <p className="text-lg text-text-secondary max-w-lg mx-auto">
        Your workspace is ready. Let's personalize your experience to help you close more deals.
      </p>
      <Button size="lg" variant="primary" onClick={() => setCurrentStep('industry')}>
        Let's Go
      </Button>
    </div>
  );

  const renderIndustry = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">What industry are you in?</h2>
        <p className="text-text-secondary">This helps us tailor your default pipelines and AI models.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {['Real Estate', 'SaaS / Software', 'Consulting', 'Agency', 'Financial Services', 'Other'].map((ind) => (
          <button
            key={ind}
            onClick={() => setIndustry(ind)}
            className={`p-4 rounded-xl border text-left transition-all ${
              industry === ind
                ? 'border-primary-500 bg-primary-500/10 text-white'
                : 'border-border bg-bg-elevated hover:border-border-hover text-text-secondary hover:text-white'
            }`}
          >
            <span className="font-medium">{ind}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-between pt-8">
        <Button variant="secondary" onClick={() => setCurrentStep('welcome')}>Back</Button>
        <Button variant="primary" disabled={!industry} onClick={() => setCurrentStep('teamSize')}>Next</Button>
      </div>
    </div>
  );

  const renderTeamSize = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">How big is your team?</h2>
        <p className="text-text-secondary">We'll optimize the collaboration features for your size.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {['Just me', '2 - 10', '11 - 50', '51 - 200', '200+'].map((size) => (
          <button
            key={size}
            onClick={() => setTeamSize(size)}
            className={`p-4 rounded-xl border text-center transition-all ${
              teamSize === size
                ? 'border-primary-500 bg-primary-500/10 text-white'
                : 'border-border bg-bg-elevated hover:border-border-hover text-text-secondary hover:text-white'
            }`}
          >
            <span className="font-medium">{size}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-between pt-8">
        <Button variant="secondary" onClick={() => setCurrentStep('industry')}>Back</Button>
        <Button variant="primary" disabled={!teamSize} onClick={() => setCurrentStep('goals')}>Next</Button>
      </div>
    </div>
  );

  const renderGoals = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">What is your primary goal?</h2>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {[
          'Manage deals and pipelines faster',
          'Automate multi-channel outreach (WhatsApp/Instagram)',
          'Track team performance and analytics',
          'Organize scattered lead data in one place'
        ].map((g) => (
          <button
            key={g}
            onClick={() => setGoal(g)}
            className={`p-4 rounded-xl border text-left transition-all ${
              goal === g
                ? 'border-primary-500 bg-primary-500/10 text-white'
                : 'border-border bg-bg-elevated hover:border-border-hover text-text-secondary hover:text-white'
            }`}
          >
            <span className="font-medium">{g}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-between pt-8">
        <Button variant="secondary" onClick={() => setCurrentStep('teamSize')}>Back</Button>
        <Button variant="primary" disabled={!goal} onClick={() => setCurrentStep('crm')}>Next</Button>
      </div>
    </div>
  );

  const renderCrm = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">How do you currently manage leads?</h2>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {['Spreadsheets', 'HubSpot', 'Salesforce', 'Pipedrive', 'Notion/Airtable', 'Nothing yet'].map((crm) => (
          <button
            key={crm}
            onClick={() => setCrmPreference(crm)}
            className={`p-4 rounded-xl border text-left transition-all ${
              crmPreference === crm
                ? 'border-primary-500 bg-primary-500/10 text-white'
                : 'border-border bg-bg-elevated hover:border-border-hover text-text-secondary hover:text-white'
            }`}
          >
            <span className="font-medium">{crm}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-between pt-8">
        <Button variant="secondary" onClick={() => setCurrentStep('goals')}>Back</Button>
        <Button variant="primary" disabled={!crmPreference} onClick={() => setCurrentStep('invites')}>Next</Button>
      </div>
    </div>
  );

  const renderInvites = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">Invite your team</h2>
        <p className="text-text-secondary">LeadOS is better with your team. Invite them now to get started together.</p>
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <input
            key={i}
            type="email"
            placeholder={`teammate${i}@example.com`}
            className="w-full px-4 py-3 bg-bg-base border border-border rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          />
        ))}
      </div>
      <div className="flex items-center justify-between pt-8">
        <Button variant="ghost" className="text-text-secondary" onClick={() => setCurrentStep('import')}>Skip for now</Button>
        <div className="space-x-3">
          <Button variant="secondary" onClick={() => setCurrentStep('crm')}>Back</Button>
          <Button variant="primary" onClick={() => setCurrentStep('import')}>Send Invites & Next</Button>
        </div>
      </div>
    </div>
  );

  const renderImport = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">Import your data</h2>
        <p className="text-text-secondary">Bring your existing contacts and leads into LeadOS via CSV.</p>
      </div>
      <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center hover:bg-[#151522] transition-colors cursor-pointer">
        <svg className="w-10 h-10 text-primary-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <h3 className="text-lg font-medium text-white mb-1">Click to upload CSV</h3>
        <p className="text-sm text-text-tertiary">Max file size 10MB</p>
      </div>
      <div className="flex items-center justify-between pt-8">
        <Button variant="ghost" className="text-text-secondary" onClick={() => setCurrentStep('channels')}>Skip for now</Button>
        <div className="space-x-3">
          <Button variant="secondary" onClick={() => setCurrentStep('invites')}>Back</Button>
          <Button variant="primary" onClick={() => setCurrentStep('channels')}>Next</Button>
        </div>
      </div>
    </div>
  );

  const renderChannels = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">Connect Channels</h2>
        <p className="text-text-secondary">Sync your WhatsApp and Instagram to manage conversations directly in LeadOS.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-6 border border-border rounded-xl bg-bg-elevated text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.031 0C5.39 0 0 5.39 0 12.031c0 2.115.548 4.185 1.589 6.007L.492 23.518l5.61-1.472a11.96 11.96 0 005.929 1.565c6.64 0 12.031-5.39 12.031-12.031S18.672 0 12.031 0zm0 21.602a9.927 9.927 0 01-5.06-1.385l-.364-.216-3.766.987.997-3.668-.236-.376a9.907 9.907 0 01-1.517-5.31C2.085 6.467 6.466 2.086 12.031 2.086c5.565 0 9.946 4.381 9.946 9.945 0 5.565-4.381 9.946-9.946 9.946zm5.454-7.447c-.299-.15-1.768-.874-2.043-.974-.275-.1-.475-.15-.675.15-.2.3-.775.975-.95 1.175-.175.2-.35.225-.65.075-1.393-.695-2.585-1.637-3.486-2.755-.175-.225-.018-.344.131-.493.136-.135.299-.35.45-.525.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.525-.075-.15-.675-1.625-.925-2.225-.25-.6-.5-.525-.675-.525h-.575c-.2 0-.525.075-.8.375-.275.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.114 3.228 5.12 4.525.716.309 1.275.494 1.71.632.716.228 1.368.196 1.884.119.58-.087 1.768-.724 2.018-1.424.25-.7.25-1.3.175-1.425-.075-.125-.275-.2-.575-.35z"/>
            </svg>
          </div>
          <h3 className="font-medium text-white">WhatsApp API</h3>
          <Button variant="secondary" className="w-full">Connect</Button>
        </div>
        <div className="p-6 border border-border rounded-xl bg-bg-elevated text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-pink-500/10 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
            </svg>
          </div>
          <h3 className="font-medium text-white">Instagram DM</h3>
          <Button variant="secondary" className="w-full">Connect</Button>
        </div>
      </div>
      <div className="flex items-center justify-between pt-8">
        <Button variant="ghost" className="text-text-secondary" onClick={() => setCurrentStep('plan')}>Skip for now</Button>
        <div className="space-x-3">
          <Button variant="secondary" onClick={() => setCurrentStep('import')}>Back</Button>
          <Button variant="primary" onClick={() => setCurrentStep('plan')}>Next</Button>
        </div>
      </div>
    </div>
  );

  const renderPlan = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2 text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Choose your plan</h2>
        <p className="text-text-secondary">You can start in trial mode today. Billing setup is pending.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { name: 'Starter', price: 'Trial mode', desc: 'Basic CRM & Manual Leads' },
          { name: 'Growth', price: 'Billing pending', desc: 'AI Scoring & Follow-ups' },
          { name: 'Scale', price: 'Contact sales', desc: 'Advanced Automations' }
        ].map((p) => (
          <button
            key={p.name}
            onClick={() => setPlan(p.name)}
            className={`p-6 rounded-xl border text-center transition-all flex flex-col items-center gap-2 ${
              plan === p.name
                ? 'border-primary-500 bg-primary-500/10 text-white shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                : 'border-border bg-bg-elevated hover:border-border-hover text-text-secondary hover:text-white'
            }`}
          >
            <h3 className="text-lg font-bold">{p.name}</h3>
            <span className="text-2xl font-semibold text-white">{p.price}</span>
            <span className="text-sm opacity-80">{p.desc}</span>
          </button>
        ))}
      </div>
      
      {plan && (
        <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm text-center">
          ℹ️ Billing setup pending; you can start in trial mode.
        </div>
      )}

      <div className="flex items-center justify-between pt-8">
        <Button variant="secondary" onClick={() => setCurrentStep('channels')} disabled={loading}>Back</Button>
        <Button variant="primary" onClick={handleFinish} disabled={!plan || loading}>
          {loading ? 'Finishing...' : 'Go to Dashboard'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {currentStep === 'welcome' && renderWelcome()}
      {currentStep === 'industry' && renderIndustry()}
      {currentStep === 'teamSize' && renderTeamSize()}
      {currentStep === 'goals' && renderGoals()}
      {currentStep === 'crm' && renderCrm()}
      {currentStep === 'invites' && renderInvites()}
      {currentStep === 'import' && renderImport()}
      {currentStep === 'channels' && renderChannels()}
      {currentStep === 'plan' && renderPlan()}
    </div>
  );
}
