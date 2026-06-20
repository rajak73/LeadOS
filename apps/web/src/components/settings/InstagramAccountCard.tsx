'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { InstagramAccount } from '@/lib/types/api';

interface InstagramAccountCardProps {
  account: InstagramAccount;
  onDisconnect: (id: string) => void;
  isDisconnecting: boolean;
}

const statusVariant: Record<string, 'won' | 'stale' | 'lost'> = {
  ACTIVE: 'won',
  EXPIRED: 'stale',
  DISCONNECTED: 'lost',
};

const statusLabel: Record<string, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Token expired',
  DISCONNECTED: 'Disconnected',
};

export function InstagramAccountCard({ account, onDisconnect, isDisconnecting }: InstagramAccountCardProps) {
  const [confirming, setConfirming] = useState(false);

  function handleDisconnectClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onDisconnect(account.id);
    setConfirming(false);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-bg-elevated">
      <div className="flex items-center gap-3 min-w-0">
        {account.profilePictureUrl ? (
          <img
            src={account.profilePictureUrl}
            alt={account.igUsername ?? account.igUserId}
            className="w-8 h-8 rounded-full shrink-0 object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full shrink-0 bg-bg-subtle flex items-center justify-center text-text-tertiary text-xs">
            IG
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-text-primary font-medium truncate">
            @{account.igUsername ?? account.igUserId}
          </p>
          <p className="text-xs text-text-tertiary">
            Token expires {new Date(account.tokenExpiresAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <Badge variant={statusVariant[account.status] ?? 'default'}>
          {statusLabel[account.status] ?? account.status}
        </Badge>
        {account.status !== 'DISCONNECTED' && (
          <Button
            variant={confirming ? 'danger' : 'ghost'}
            size="sm"
            onClick={handleDisconnectClick}
            disabled={isDisconnecting}
            onBlur={() => setConfirming(false)}
          >
            {confirming ? 'Confirm disconnect' : 'Disconnect'}
          </Button>
        )}
      </div>
    </div>
  );
}
