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
    <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-3 min-w-0">
        {account.profilePictureUrl ? (
          <img
            src={account.profilePictureUrl}
            alt={account.igUsername ?? account.igUserId}
            className="w-8 h-8 rounded-full shrink-0 object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full shrink-0 bg-slate-50 flex items-center justify-center text-slate-500 text-xs">
            {account.platform === 'FACEBOOK' ? 'FB' : 'IG'}
          </div>
        )}
        <div className="min-w-0 flex flex-col items-start gap-1">
          <div className="flex items-center gap-2">
            <p className="text-sm text-slate-900 font-medium truncate">
              {account.platform === 'FACEBOOK' ? account.igUsername ?? account.igUserId : `@${account.igUsername ?? account.igUserId}`}
            </p>
            <Badge variant="default">{account.platform === 'FACEBOOK' ? 'Facebook Page' : 'Instagram'}</Badge>
          </div>
          <p className="text-xs text-slate-500">
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
