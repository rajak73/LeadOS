'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLeadDetail } from '@/lib/hooks/useLeadDetail';
import { useConvertLead } from '@/lib/hooks/useLeadActions';
import { useToast } from '@/components/ui/Toast';
import { LeadMetadataForm } from './LeadMetadataForm';
import { LeadStatusBadge } from './LeadStatusBadge';
import { LeadScoreBadge } from './LeadScoreBadge';
import { LeadScorePopover } from './LeadScorePopover';
import { LeadActivityFeed } from './LeadActivityFeed';
import { LeadNotesList } from './LeadNotesList';
import { LeadFilesList } from './LeadFilesList';
import { LinkedDealsPanel } from './LinkedDealsPanel';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { Lead } from '@/lib/types/api';

interface LeadDetailPageProps {
  leadId: string;
  initialLead?: Lead;
}

export function LeadDetailPage({ leadId, initialLead }: LeadDetailPageProps) {
  const { data: lead, isLoading } = useLeadDetail(leadId, initialLead);
  const { mutate: convert, isPending: converting } = useConvertLead();
  const { toast } = useToast();
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [showScoreDetails, setShowScoreDetails] = useState(false);

  if (isLoading || !lead) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleConvert = () => {
    convert(lead.id, {
      onSuccess: () => toast('Lead converted to contact', 'success'),
      onError: () => toast('Failed to convert lead', 'error'),
    });
    setConfirmConvert(false);
  };

  const tabs = [
    { value: 'activity', label: 'Activity', content: <LeadActivityFeed leadId={lead.id} /> },
    { value: 'notes', label: 'Notes', content: <LeadNotesList leadId={lead.id} /> },
    { value: 'files', label: 'Files', content: <LeadFilesList leadId={lead.id} /> },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full" data-testid="lead-detail-page">
      {/* Back nav */}
      <div className="lg:hidden">
        <Link href="/leads" className="text-sm text-slate-600 hover:text-slate-900">
          ← Back to Leads
        </Link>
      </div>

      {/* Left panel — 60% */}
      <div className="flex-[3] min-w-0 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/leads" className="hidden lg:inline text-sm text-slate-600 hover:text-slate-900">
            ← Back
          </Link>
          <LeadStatusBadge status={lead.status} />
          <LeadScoreBadge score={lead.aiScore} onClick={() => setShowScoreDetails(true)} />
        </div>

        <LeadMetadataForm lead={lead} />

        {/* Linked deals */}
        <div className="border-t border-slate-200 pt-4">
          <LinkedDealsPanel leadId={lead.id} />
        </div>

        {/* Convert to Contact CTA */}
        {lead.status !== 'WON' && lead.status !== 'LOST' && !lead.convertedToContactId && (
          <div className="border-t border-slate-200 pt-4">
            {!confirmConvert ? (
              <button
                type="button"
                onClick={() => setConfirmConvert(true)}
                data-testid="btn-convert-lead"
                className="text-sm text-primary-400 hover:underline"
              >
                Convert to Contact…
              </button>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-600">Convert this lead to a contact? This cannot be undone.</span>
                <Button
                  variant="primary"
                  onClick={handleConvert}
                  disabled={converting}
                  data-testid="btn-confirm-convert"
                >
                  {converting ? 'Converting…' : 'Confirm'}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmConvert(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {lead.convertedToContactId && (
          <div className="rounded-lg p-3 text-sm bg-green-500/10 border border-green-500/20 text-green-400">
            Converted to Contact
          </div>
        )}

        {(lead.status === 'WON' || lead.status === 'LOST') && (
          <div
            className={`rounded-lg p-3 text-sm font-medium ${
              lead.status === 'WON'
                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : 'bg-red-500/15 text-red-400 border border-red-500/30'
            }`}
          >
            {lead.status === 'WON' ? '🏆 Lead Won' : '✗ Lead Lost'}
          </div>
        )}
      </div>

      {/* Right panel — 40% */}
      <div className="flex-[2] min-w-0 min-h-[400px] lg:min-h-0 border border-slate-200 rounded-xl overflow-hidden">
        <Tabs defaultValue="activity" tabs={tabs} />
      </div>

      <LeadScorePopover
        leadId={lead.id}
        open={showScoreDetails}
        onOpenChange={setShowScoreDetails}
      />
    </div>
  );
}
