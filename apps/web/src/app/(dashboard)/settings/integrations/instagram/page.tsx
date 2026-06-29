import { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { InstagramIntegrationView } from './InstagramIntegrationView';

export const metadata = { title: 'Meta Integration — LeadOS' };

export default function InstagramIntegrationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      }
    >
      <InstagramIntegrationView />
    </Suspense>
  );
}
