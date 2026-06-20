'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { apiClient } from '@/lib/api-client';

interface ImportJobStatus {
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  totalRows: number;
  processedRows: number;
  errorRows: ImportRowError[];
}

interface ImportRowError {
  row: number;
  errors: string[];
}

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
}

export function CsvImportModal({ open, onClose }: CsvImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'polling' | 'done' | 'error'>('idle');
  const [jobStatus, setJobStatus] = useState<ImportJobStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => {
    setPhase('idle');
    setJobStatus(null);
    setErrorMsg('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pollJob = async (jobId: string) => {
    setPhase('polling');
    const MAX_POLLS = 60;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await apiClient.get<{ data: ImportJobStatus }>(`/leads/import/${jobId}`);
        const status = res.data.data;
        setJobStatus(status);
        if (status.status === 'DONE' || status.status === 'FAILED') {
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

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setPhase('uploading');
    setErrorMsg('');

    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<{ data: { jobId: string } }>('/leads/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const jobId = res.data.data.jobId;
      await pollJob(jobId);
    } catch {
      setPhase('error');
      setErrorMsg('Upload failed — ensure the file is a valid CSV under 5 MB');
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) handleClose(); }} title="Import Leads from CSV">
      <div className="space-y-4" data-testid="csv-import-modal">
        {(phase === 'idle' || phase === 'uploading') && (
          <>
            <p className="text-sm text-text-secondary">
              Upload a CSV with columns: <code className="text-primary-400">firstName, lastName, email, phone, source, status, tags</code>
            </p>
            <label htmlFor="csv-upload" className="sr-only">CSV file</label>
            <input
              id="csv-upload"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              data-testid="file-input"
              className="block w-full text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border file:bg-bg-elevated file:text-text-primary file:text-xs hover:file:border-border/80 file:transition-colors"
            />
            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                onClick={handleUpload}
                disabled={phase === 'uploading'}
                data-testid="btn-start-import"
              >
                {phase === 'uploading' ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Uploading…</span>
                  </>
                ) : (
                  'Upload & Import'
                )}
              </Button>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {phase === 'polling' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Spinner size="lg" />
            <p className="text-sm text-text-secondary">Processing import…</p>
            {jobStatus && (
              <p className="text-xs text-text-tertiary">
                {jobStatus.processedRows} / {jobStatus.totalRows} rows processed
              </p>
            )}
          </div>
        )}

        {phase === 'done' && jobStatus && (
          <div className="space-y-4">
            <div
              className={`rounded-lg p-3 text-sm ${
                jobStatus.status === 'DONE'
                  ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {jobStatus.status === 'DONE'
                ? `Import complete — ${jobStatus.processedRows} rows processed.`
                : 'Import failed.'}
            </div>

            {jobStatus.errorRows.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-tertiary mb-2" data-testid="error-rows-header">
                  {jobStatus.errorRows.length} row{jobStatus.errorRows.length !== 1 ? 's' : ''} had errors:
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2" data-testid="error-rows-list">
                  {jobStatus.errorRows.map((r) => (
                    <div
                      key={r.row}
                      className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2 text-red-400"
                      data-testid={`error-row-${r.row}`}
                    >
                      <span className="font-medium">Row {r.row}:</span> {r.errors.join('; ')}
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
