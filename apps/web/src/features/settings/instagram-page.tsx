import { Card } from '@/components/ui/card';
import { Callout } from '@/components/ui/callout';
import { ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useInstagramStatus } from '@/api/instagram';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { AccountCard } from './instagram/account-card';
import { SetupGuide } from './instagram/setup-guide';
import { SimulateCard } from './instagram/simulate-card';

export default function InstagramSettingsPage() {
  useDocumentTitle('Instagram settings');
  const { data: status, isLoading, error, refetch, isRefetching } = useInstagramStatus();

  if (isLoading)
    return (
      <LoadingRegion label="Loading Instagram settings…">
        <Card className="space-y-4 p-5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </Card>
      </LoadingRegion>
    );
  if (!status)
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isRefetching}
      />
    );

  return (
    <div className="flex flex-col gap-6">
      {status.testMode && (
        <Callout tone="info" title="Test mode — nothing is sent to Instagram">
          Messages and replies stay inside LeadOS, so you can try everything safely. Connect with
          any token, then use “Simulate incoming” below.
        </Callout>
      )}
      {status.connected && status.account ? (
        <AccountCard status={status} account={status.account} />
      ) : (
        <SetupGuide status={status} />
      )}
      {status.testMode && <SimulateCard />}
    </div>
  );
}
