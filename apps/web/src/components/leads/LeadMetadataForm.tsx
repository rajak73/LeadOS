'use client';

import { useEffect, useState } from 'react';
import { usePatchLead } from '@/lib/hooks/useLeadActions';
import { useToast } from '@/components/ui/Toast';
import { ALL_LEAD_SOURCES, LEAD_STATUS_TRANSITIONS, formatLeadSource, formatLeadStatus } from '@/lib/types/api';
import type { Lead, LeadStatus } from '@/lib/types/api';

interface LeadMetadataFormProps {
  lead: Lead;
}

export function LeadMetadataForm({ lead }: LeadMetadataFormProps) {
  const { mutate: patch } = usePatchLead(lead.id);
  const { toast } = useToast();

  const [firstName, setFirstName] = useState(lead.firstName);
  const [lastName, setLastName] = useState(lead.lastName ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [phone, setPhone] = useState(lead.phone ?? '');

  useEffect(() => {
    setFirstName(lead.firstName);
    setLastName(lead.lastName ?? '');
    setEmail(lead.email ?? '');
    setPhone(lead.phone ?? '');
  }, [lead.id, lead.firstName, lead.lastName, lead.email, lead.phone]);

  const handleBlur = (field: string, val: unknown) => {
    patch({ [field]: val || null }, { onError: () => toast(`Failed to update ${field}`, 'error') });
  };

  const isTerminal = lead.status === 'WON' || lead.status === 'LOST';
  const allowedTransitions = LEAD_STATUS_TRANSITIONS[lead.status];

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as LeadStatus;
    if (next !== lead.status) {
      patch({ status: next }, { onError: () => toast('Failed to update status', 'error') });
    }
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    patch({ source: e.target.value }, { onError: () => toast('Failed to update source', 'error') });
  };

  const inputClass =
    'w-full text-sm text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary-500 focus:outline-none pb-0.5 transition-colors';
  const readonlyClass = 'text-sm text-slate-900';

  return (
    <div className="space-y-4" data-testid="lead-metadata-form">
      {/* Name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">First name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={() => firstName !== lead.firstName && handleBlur('firstName', firstName)}
            className={inputClass}
            data-testid="field-firstName"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Last name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={() => lastName !== (lead.lastName ?? '') && handleBlur('lastName', lastName)}
            className={inputClass}
            data-testid="field-lastName"
          />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => email !== (lead.email ?? '') && handleBlur('email', email)}
            className={inputClass}
            data-testid="field-email"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => phone !== (lead.phone ?? '') && handleBlur('phone', phone)}
            className={inputClass}
            data-testid="field-phone"
          />
        </div>
      </div>

      {/* Status machine */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Status</label>
          {isTerminal || allowedTransitions.length === 0 ? (
            <p className={readonlyClass}>{formatLeadStatus(lead.status)}</p>
          ) : (
            <select
              value={lead.status}
              onChange={handleStatusChange}
              data-testid="field-status"
              className="text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-primary-500"
            >
              <option value={lead.status}>{formatLeadStatus(lead.status)}</option>
              {allowedTransitions.map((s) => (
                <option key={s} value={s}>
                  {formatLeadStatus(s)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Source</label>
          <select
            value={lead.source}
            onChange={handleSourceChange}
            data-testid="field-source"
            className="text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-primary-500"
          >
            {ALL_LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {formatLeadSource(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* AI score (read-only) */}
      <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 border-t border-slate-200 pt-4">
        <div>
          <span className="block mb-0.5">AI Score</span>
          <span className={`font-medium ${(lead.aiScore ?? 0) >= 70 ? 'text-green-400' : (lead.aiScore ?? 0) >= 40 ? 'text-yellow-400' : 'text-slate-600'}`}>
            {lead.aiScore !== null ? lead.aiScore : '—'}
          </span>
        </div>
        <div>
          <span className="block mb-0.5">Created</span>
          <span className="text-slate-600">{lead.createdAt.split('T')[0]}</span>
        </div>
        {lead.instagramHandle && (
          <div>
            <span className="block mb-0.5">Instagram</span>
            <span className="text-slate-600">@{lead.instagramHandle}</span>
          </div>
        )}
        {lead.lostReason && (
          <div className="col-span-2">
            <span className="block mb-0.5">Lost reason</span>
            <span className="text-red-400">{lead.lostReason}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {lead.tags.length > 0 && (
        <div>
          <label className="text-xs text-slate-500 block mb-1.5">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map((t) => (
              <span key={t} className="px-2 py-0.5 text-xs border border-slate-200 bg-slate-50 rounded text-slate-600">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
