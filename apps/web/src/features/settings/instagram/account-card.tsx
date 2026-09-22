import { useState } from 'react';
import { ExternalLink, RefreshCw, Unplug } from 'lucide-react';
import type { InstagramStatus } from '@leados/shared';
import { useDisconnectInstagram } from '@/api/instagram';
import { IgAvatar } from '@/components/domain/ig-avatar';
import { RelativeTime } from '@/components/domain/relative-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate } from '@/lib/format';
import { igAccountStatusLabels, igAccountStatusTones } from '@/lib/labels';
import { notify } from '@/lib/toast';
import { ConnectForm } from './connect-form';
import { WebhookValues } from './webhook-values';

type Account = NonNullable<InstagramStatus['account']>;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="type-caption text-fg-subtle">{label}</dt>
      <dd className="type-body text-fg">{children}</dd>
    </div>
  );
}

/** The connected account: health, token expiry, last webhook, reconnect and disconnect. */
export function AccountCard({ status, account }: { status: InstagramStatus; account: Account }) {
  const [reconnecting, setReconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const disconnect = useDisconnectInstagram();
  const healthy = account.status === 'ACTIVE';

  return (
    <>
      <Card>
        <CardHeader
          title="Connected account"
          actions={
            <Button
              variant="ghost"
              size="sm"
              icon={<Unplug aria-hidden />}
              onClick={() => setConfirmOpen(true)}
            >
              Disconnect
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <IgAvatar name={account.name || account.username} src={account.profilePictureUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate type-body font-semibold text-fg">
                {account.name || `@${account.username}`}
              </p>
              <a
                href={`https://instagram.com/${encodeURIComponent(account.username)}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 type-small text-fg-muted hover:text-fg hover:underline"
              >
                @{account.username}
                <ExternalLink aria-hidden className="size-3" />
                <span className="sr-only"> on Instagram (opens in a new tab)</span>
              </a>
            </div>
            <Badge tone={igAccountStatusTones[account.status]} dot>
              {igAccountStatusLabels[account.status]}
            </Badge>
          </div>

          {!healthy && !reconnecting && (
            <Callout
              tone={account.status === 'EXPIRED' ? 'warning' : 'danger'}
              title="Instagram needs you to reconnect"
              actions={
                <Button
                  size="sm"
                  icon={<RefreshCw aria-hidden />}
                  onClick={() => setReconnecting(true)}
                >
                  Reconnect
                </Button>
              }
            >
              {account.statusMessage ||
                'LeadOS can’t reach your account right now, so messages aren’t being answered.'}
            </Callout>
          )}
          {reconnecting && (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 type-small text-fg-muted">
                Generate a new token in the Meta dashboard (Instagram → API setup → Generate token)
                and paste it here.
              </p>
              <ConnectForm
                submitLabel="Reconnect"
                onDone={() => setReconnecting(false)}
                onCancel={() => setReconnecting(false)}
              />
            </div>
          )}

          <dl className="grid gap-4 sm:grid-cols-3">
            <Detail label="Connected">{formatDate(account.connectedAt)}</Detail>
            <Detail label="Token renews by">
              {account.tokenExpiresAt ? formatDate(account.tokenExpiresAt) : 'Doesn’t expire'}
            </Detail>
            <Detail label="Last message from Instagram">
              {account.lastWebhookAt ? <RelativeTime date={account.lastWebhookAt} /> : 'Never'}
            </Detail>
          </dl>
          {healthy && !reconnecting && (
            <Button variant="link" className="self-start" onClick={() => setReconnecting(true)}>
              Use a different token
            </Button>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Webhook"
          description="Already set up? You only need these if you change your Meta app."
        />
        <CardBody>
          <WebhookValues status={status} />
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Disconnect @${account.username}?`}
        description="LeadOS stops receiving and answering Instagram messages and comments. Conversations you already have stay in the inbox."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          await disconnect.mutateAsync();
          notify.success('Instagram disconnected');
        }}
      />
    </>
  );
}
