'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { apiClient } from '@/lib/api-client';

interface ImportJobStatus {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  recordsTotal: number;
  recordsImported: number;
  recordsFailed: number;
  recordsSkipped: number;
  errorSummary: { row: number; error: string }[];
}

interface TeamResponse {
  data: Array<{
    id: string;
    userId: string;
    user: { firstName: string; lastName: string; email: string };
    role: { name: string };
    status: string;
  }>;
}

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
}

const LEAD_FIELDS = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'tags', label: 'Tags' },
  { key: 'source', label: 'Source' },
];

export function CsvImportModal({ open, onClose }: CsvImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'mapping' | 'assignment' | 'submitting' | 'polling' | 'done' | 'error'>('idle');
  const [jobStatus, setJobStatus] = useState<ImportJobStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const [assignmentType, setAssignmentType] = useState<'NONE' | 'SINGLE' | 'ROUND_ROBIN'>('NONE');
  const [assigneeId, setAssigneeId] = useState<string>('');

  const [teamMembers, setTeamMembers] = useState<TeamResponse['data']>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);

  const reset = () => {
    setPhase('idle');
    setJobStatus(null);
    setErrorMsg('');
    setFile(null);
    setCsvHeaders([]);
    setMappings({});
    setAssignmentType('NONE');
    setAssigneeId('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const firstLine = text.split('\n')[0] || '';
      const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      setCsvHeaders(headers);

      const autoMappings: Record<string, string> = {};
      LEAD_FIELDS.forEach(field => {
        const match = headers.find(
          h => h.toLowerCase() === field.key.toLowerCase() || h.toLowerCase() === field.label.toLowerCase()
        );
        if (match) autoMappings[field.key] = match;
      });
      setMappings(autoMappings);
      setPhase('mapping');
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file');
      setPhase('error');
    };
    reader.readAsText(f.slice(0, 1024));
  };

  const handleMappingNext = () => {
    setPhase('assignment');

    if (teamMembers.length === 0) {
      setIsLoadingTeam(true);
      apiClient.get<TeamResponse>('/team').then(res => {
        setTeamMembers(res.data.data.filter(m => 
          m.status === 'ACTIVE' && 
          ['SALES_EXECUTIVE', 'MANAGER', 'ADMIN'].includes(m.role.name)
        ));
        setIsLoadingTeam(false);
      }).catch(() => {
        setIsLoadingTeam(false);
      });
    }
  };

  const pollJob = async (historyId: string) => {
    setPhase('polling');
    const MAX_POLLS = 60;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await apiClient.get<{ data: ImportJobStatus }>(`/leads/import-history/${historyId}`);
        const status = res.data.data;
        setJobStatus(status);
        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          setPhase('done');
          return;
        }
      } catch {
        setPhase('error');
        setErrorMsg('Failed to check import status');
        return;
      }
    }
    setPhase('error');
    setErrorMsg('Import timed out — check back later');
  };

  const handleStartImport = async () => {
    if (!file) return;

    setPhase('submitting');
    setErrorMsg('');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mappings', JSON.stringify(mappings));
      form.append('assignment', JSON.stringify({
        type: assignmentType,
        userId: assignmentType === 'SINGLE' ? assigneeId : undefined
      }));

      const res = await apiClient.post<{ data: { jobId: string, historyId: string } }>('/leads/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const historyId = res.data.data.historyId;
      await pollJob(historyId);
    } catch {
      setPhase('error');
      setErrorMsg('Upload failed — ensure the file is a valid CSV under 5 MB');
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) handleClose(); }} title="Import Leads from CSV">
      <div className="space-y-4" data-testid="csv-import-modal">
        {phase === 'idle' && (
          <>
            <p className="text-sm text-text-secondary">
              Upload a CSV file containing your leads. We'll map the columns in the next step.
            </p>
            <label htmlFor="csv-upload" className="sr-only">CSV file</label>
            <input
              id="csv-upload"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              data-testid="file-input"
              className="block w-full text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border file:bg-bg-elevated file:text-text-primary file:text-xs hover:file:border-border/80 file:transition-colors"
            />
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {phase === 'mapping' && (
          <>
            <h3 className="text-sm font-medium text-text-primary">Step 2: Map Columns</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {LEAD_FIELDS.map(field => (
                <div key={field.key} className="flex items-center gap-4">
                  <div className="w-1/3 text-sm text-text-secondary">{field.label} {field.key === 'firstName' && '*'}</div>
                  <div className="w-2/3">
                    <select
                      className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      value={mappings[field.key] || ''}
                      onChange={(e) => setMappings({ ...mappings, [field.key]: e.target.value })}
                    >
                      <option value="">-- Skip / Default --</option>
                      {csvHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="primary" onClick={handleMappingNext} disabled={!mappings.firstName}>
                Next: Assignment
              </Button>
              <Button variant="secondary" onClick={reset}>
                Back
              </Button>
            </div>
          </>
        )}

        {phase === 'assignment' && (
          <>
            <h3 className="text-sm font-medium text-text-primary">Step 3: Assignment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Assignment Type</label>
                <select
                  className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-sm"
                  value={assignmentType}
                  onChange={(e) => setAssignmentType(e.target.value as 'NONE' | 'SINGLE' | 'ROUND_ROBIN')}
                >
                  <option value="NONE">Unassigned</option>
                  <option value="SINGLE">Assign to specific user</option>
                  <option value="ROUND_ROBIN">Round Robin (Sales Team)</option>
                </select>
              </div>

              {assignmentType === 'SINGLE' && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Select User</label>
                  {isLoadingTeam ? (
                    <Spinner size="sm" />
                  ) : (
                    <select
                      className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-sm"
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                    >
                      <option value="" disabled>Select a user...</option>
                      {teamMembers.map(m => (
                        <option key={m.userId} value={m.userId}>
                          {m.user.firstName} {m.user.lastName} ({m.role.name})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1 mt-4">
              <Button variant="primary" onClick={handleStartImport} disabled={assignmentType === 'SINGLE' && !assigneeId}>
                Start Import
              </Button>
              <Button variant="secondary" onClick={() => setPhase('mapping')}>
                Back
              </Button>
            </div>
          </>
        )}

        {(phase === 'submitting' || phase === 'polling') && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Spinner size="lg" />
            <p className="text-sm text-text-secondary">
              {phase === 'submitting' ? 'Submitting import job...' : 'Processing import…'}
            </p>
            {jobStatus && (
              <p className="text-xs text-text-tertiary">
                {jobStatus.recordsImported + jobStatus.recordsSkipped + jobStatus.recordsFailed} / {jobStatus.recordsTotal} rows processed
              </p>
            )}
          </div>
        )}

        {phase === 'done' && jobStatus && (
          <div className="space-y-4">
            <div
              className={`rounded-lg p-3 text-sm ${
                jobStatus.status === 'COMPLETED'
                  ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {jobStatus.status === 'COMPLETED'
                ? `Import complete — ${jobStatus.recordsImported} imported, ${jobStatus.recordsSkipped} skipped.`
                : 'Import failed.'}
            </div>

            {jobStatus.errorSummary && jobStatus.errorSummary.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-tertiary mb-2" data-testid="error-rows-header">
                  {jobStatus.recordsFailed} row{jobStatus.recordsFailed !== 1 ? 's' : ''} had errors:
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2" data-testid="error-rows-list">
                  {jobStatus.errorSummary.map((r: { row: number; error: string }) => (
                    <div
                      key={r.row || Math.random()}
                      className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2 text-red-400"
                      data-testid={`error-row-${r.row}`}
                    >
                      <span className="font-medium">Row {r.row}:</span> {r.error ? r.error : JSON.stringify(r)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="primary" onClick={reset} data-testid="btn-import-again">
                Import another file
              </Button>
              <Button variant="secondary" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-4">
            <div className="rounded-lg p-3 text-sm bg-red-500/10 border border-red-500/20 text-red-400" data-testid="import-error-msg">
              {errorMsg}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset}>
                Try again
              </Button>
              <Button variant="secondary" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
