'use client';

import { useLeadFiles } from '@/lib/hooks/useLeadFiles';
import { Spinner } from '@/components/ui/Spinner';
import { formatRelativeTime } from '@/lib/types/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LeadFilesListProps {
  leadId: string;
}

export function LeadFilesList({ leadId }: LeadFilesListProps) {
  const { data, isLoading } = useLeadFiles(leadId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const files = data?.data ?? [];

  return (
    <div className="space-y-3" data-testid="lead-files-list">
      {/* Upload placeholder — presigned URL flow requires backend storage config */}
      <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
        File upload coming soon — requires presigned URL infrastructure
      </div>

      {files.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-2">No files attached</p>
      )}

      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg"
          data-testid={`file-${file.id}`}
        >
          <div>
            <p className="text-sm text-slate-900 font-medium">{file.filename}</p>
            <p className="text-xs text-slate-500">
              {formatBytes(file.sizeBytes)} · {formatRelativeTime(file.createdAt)}
            </p>
          </div>
          {file.url && (
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary-400 hover:underline"
            >
              Download
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
