import { Suspense } from 'react';
import { InstagramIntegrationView } from './InstagramIntegrationView';

export const metadata = { title: 'Instagram Integration — LeadOS' };

export default function InstagramIntegrationPage() {
  return (
    <Suspense fallback={<div className="text-sm text-text-tertiary">Loading…</div>}>
      <InstagramIntegrationView />
    </Suspense>
  );
}
