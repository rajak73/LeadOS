'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
  useWhatsAppAccounts,
  useConnectWhatsAppAccount,
  useDisconnectWhatsAppAccount,
  useWhatsAppTemplates,
  useSyncWhatsAppTemplates,
  type WhatsAppAccount,
  type WhatsAppTemplate,
  type ConnectWhatsAppAccountInput,
} from '@/lib/hooks/useWhatsApp';

// ─── Account Card ─────────────────────────────────────────────────────────────

function WhatsAppAccountCard({
  account,
  onDisconnect,
  isDisconnecting,
}: {
  account: WhatsAppAccount;
  onDisconnect: (id: string) => void;
  isDisconnecting: boolean;
}) {
  const [showTemplates, setShowTemplates] = useState(false);
  const { data: templates = [], isLoading: templatesLoading } = useWhatsAppTemplates(
    showTemplates ? account.id : null,
  );
  const syncMutation = useSyncWhatsAppTemplates(account.id);

  return (
    <div className="rounded-lg border border-slate-200 bg-surface-secondary p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* WhatsApp icon */}
          <div className="flex-shrink-0 h-9 w-9 rounded-full bg-green-500/15 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 text-green-400"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{account.displayName}</p>
            <p className="text-xs text-slate-500">{account.phoneNumber}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              account.status === 'ACTIVE'
                ? 'bg-green-500/10 text-green-400'
                : account.status === 'EXPIRED'
                  ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-zinc-500/10 text-zinc-400'
            }`}
          >
            {account.status}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTemplates((v) => !v)}
          >
            {showTemplates ? 'Hide templates' : 'Templates'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDisconnect(account.id)}
            disabled={isDisconnecting}
          >
            Disconnect
          </Button>
        </div>
      </div>

      {/* Templates panel */}
      {showTemplates && (
        <div className="border-t border-slate-200 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">Approved Templates</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? 'Syncing…' : 'Sync from Meta'}
            </Button>
          </div>
          {templatesLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-slate-500">
              No approved templates. Sync to fetch the latest from Meta.
            </p>
          ) : (
            <div className="space-y-1">
              {templates.map((tpl: WhatsAppTemplate) => (
                <div
                  key={tpl.id}
                  className="flex items-center justify-between rounded-md bg-surface px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-medium text-slate-900">{tpl.name}</p>
                    <p className="text-xs text-slate-500">
                      {tpl.language} · {tpl.category}
                    </p>
                  </div>
                  <span className="text-xs text-green-400">{tpl.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Connect Dialog ───────────────────────────────────────────────────────────

function ConnectDialog({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: ConnectWhatsAppAccountInput) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<ConnectWhatsAppAccountInput>({
    wabaId: '',
    phoneNumberId: '',
    displayName: '',
    phoneNumber: '',
    accessToken: '',
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-surface shadow-2xl">
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Connect WhatsApp Account</h2>
            <p className="mt-1 text-xs text-slate-500">
              Enter your Meta Business credentials to connect a WhatsApp Business Account (WABA).
            </p>
          </div>

          <form id="connect-whatsapp-form" onSubmit={handleSubmit} className="space-y-3">
            {(
              [
                { name: 'wabaId', label: 'WABA ID', placeholder: 'e.g. 1234567890' },
                { name: 'phoneNumberId', label: 'Phone Number ID', placeholder: 'e.g. 1098765432' },
                { name: 'displayName', label: 'Display Name', placeholder: 'e.g. Support Line' },
                { name: 'phoneNumber', label: 'Phone Number', placeholder: 'e.g. +15551234567' },
                { name: 'accessToken', label: 'Access Token', placeholder: 'Your Meta access token' },
              ] as const
            ).map((field) => (
              <div key={field.name}>
                <label
                  htmlFor={`wa-${field.name}`}
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  {field.label}
                </label>
                <input
                  id={`wa-${field.name}`}
                  name={field.name}
                  type={field.name === 'accessToken' ? 'password' : 'text'}
                  value={form[field.name]}
                  onChange={handleChange}
                  placeholder={field.placeholder}
                  required
                  className="w-full rounded-md border border-slate-200 bg-surface-secondary px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand focus:outline-none"
                />
              </div>
            ))}
          </form>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form="connect-whatsapp-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function WhatsAppIntegrationView() {
  const { data: accounts = [], isLoading } = useWhatsAppAccounts();
  const connectMutation = useConnectWhatsAppAccount();
  const disconnectMutation = useDisconnectWhatsAppAccount();

  const [showDialog, setShowDialog] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleConnect(input: ConnectWhatsAppAccountInput) {
    setErrorMsg(null);
    connectMutation.mutate(input, {
      onSuccess: () => {
        setShowDialog(false);
        setSuccessMsg('WhatsApp account connected successfully.');
      },
      onError: (err: unknown) => {
        const msg =
          err instanceof Error ? err.message : 'Failed to connect account. Please try again.';
        setErrorMsg(msg);
      },
    });
  }

  return (
    <div className="space-y-6 max-w-screen-lg">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">WhatsApp Integration</h1>
        <p className="mt-1 text-sm text-slate-600">
          Connect WhatsApp Business Accounts to send and receive messages from within LeadOS.
        </p>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-900">Connected accounts</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSuccessMsg(null);
              setErrorMsg(null);
              setShowDialog(true);
            }}
          >
            + Connect account
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-slate-200 border-dashed px-4 py-6 text-center text-sm text-slate-500">
            No WhatsApp accounts connected yet.
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <WhatsAppAccountCard
                key={account.id}
                account={account}
                onDisconnect={(id) => disconnectMutation.mutate(id)}
                isDisconnecting={disconnectMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-slate-500">
        TRIAL and STARTER plans support 1 WhatsApp account; GROWTH allows 3; SCALE allows 5; ENTERPRISE is unlimited.
        Free-form messages require the customer to initiate within the last 24 hours. Use approved templates to reach out anytime.
      </p>

      {showDialog && (
        <ConnectDialog
          onClose={() => setShowDialog(false)}
          onSubmit={handleConnect}
          isSubmitting={connectMutation.isPending}
        />
      )}
    </div>
  );
}
