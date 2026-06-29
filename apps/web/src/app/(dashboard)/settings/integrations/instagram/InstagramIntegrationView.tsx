'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { InstagramAccountCard } from '@/components/settings/InstagramAccountCard';
import {
  useInstagramAccounts,
  useConnectInstagram,
  useDisconnectInstagramAccount,
} from '@/lib/hooks/useInstagramAccounts';

export function InstagramIntegrationView() {
  const params = useSearchParams();
  const connected = params.get('connected');
  const error = params.get('error');

  const { data: accounts = [], isLoading } = useInstagramAccounts();
  const connectMutation = useConnectInstagram();
  const disconnectMutation = useDisconnectInstagramAccount();

  return (
    <div className="space-y-6 max-w-screen-lg">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Meta Integration</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Connect Instagram and Facebook pages to receive and reply to DMs and Comments from within LeadOS.
        </p>
      </div>

      {connected && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          Account connected successfully.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorMessage(error)}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">Connected accounts</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? 'Redirecting…' : '+ Connect account'}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed px-4 py-6 text-center text-sm text-text-tertiary">
            No Meta accounts connected yet.
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <InstagramAccountCard
                key={account.id}
                account={account}
                onDisconnect={(id) => disconnectMutation.mutate(id)}
                isDisconnecting={disconnectMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-text-tertiary">
        The number of connectable accounts depends on your plan. TRIAL and STARTER plans allow 1 account; GROWTH allows 3; SCALE allows 10.
      </p>
    </div>
  );
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    ACCESS_DENIED: 'Access was denied. Please try again.',
    INVALID_STATE: 'Invalid OAuth state. Please try connecting again.',
    STATE_EXPIRED: 'The connection attempt expired. Please try again.',
    ALREADY_CONNECTED: 'This account is already connected.',
    PLAN_LIMIT_EXCEEDED: 'You have reached the account limit for your plan.',
    INTERNAL_ERROR: 'An unexpected error occurred. Please try again.',
  };
  return messages[code] ?? `Connection failed (${code}). Please try again.`;
}
