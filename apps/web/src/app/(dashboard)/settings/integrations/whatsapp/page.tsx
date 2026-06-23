import { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { WhatsAppIntegrationView } from './WhatsAppIntegrationView';

export const metadata = { title: 'WhatsApp Integration — LeadOS' };

export default function WhatsAppIntegrationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      }
    >
      <WhatsAppIntegrationView />
    </Suspense>
  );
}
