'use client';

interface LeadScoreBadgeProps {
  score: number | null;
  className?: string;
  onClick?: () => void;
}

export function LeadScoreBadge({ score, className = '', onClick }: LeadScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span
        onClick={onClick}
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-bg-elevated text-text-secondary border-border ${onClick ? 'cursor-pointer hover:bg-border/30 transition-colors' : ''} ${className}`}
        data-testid="lead-score-badge-none"
      >
        AI: —
      </span>
    );
  }

  let colorClasses = 'bg-red-500/15 text-red-400 border-red-500/30';
  if (score >= 70) {
    colorClasses = 'bg-green-500/15 text-green-400 border-green-500/30';
  } else if (score >= 40) {
    colorClasses = 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
  }

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClasses} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''} ${className}`}
      data-testid={`lead-score-badge-${score}`}
    >
      AI: {score}
    </span>
  );
}
