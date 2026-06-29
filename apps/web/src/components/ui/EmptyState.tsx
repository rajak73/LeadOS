import { Button } from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      {icon && (
        <div className="w-12 h-12 rounded-full bg-bg-elevated ring-1 ring-border-strong flex items-center justify-center mb-4 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-ai-start/10 to-ai-end/10" />
          <span className="text-xl select-none relative z-10" aria-hidden="true">
            {icon}
          </span>
        </div>
      )}
      <h3 className="text-sm font-semibold text-text-primary tracking-wide">{title}</h3>
      {description && (
        <p className="mt-1.5 text-xs text-text-secondary max-w-sm leading-relaxed">{description}</p>
      )}
      {action && (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={action.onClick} className="ring-1 ring-border-strong shadow-sm hover:ring-border-strong/80 bg-bg-muted hover:bg-bg-subtle text-white">
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

interface TableEmptyStateProps {
  colSpan: number;
  icon?: string;
  title: string;
  description?: string;
}

export function TableEmptyState({ colSpan, icon, title, description }: TableEmptyStateProps) {
  const extra: Pick<EmptyStateProps, 'icon' | 'description'> = {};
  if (icon !== undefined) extra.icon = icon;
  if (description !== undefined) extra.description = description;
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12">
        <EmptyState title={title} {...extra} />
      </td>
    </tr>
  );
}
