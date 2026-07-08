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
        <div className="w-12 h-12 rounded-full bg-white ring-1 ring-slate-300 flex items-center justify-center mb-4 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-ai-start/10 to-ai-end/10" />
          <span className="text-xl select-none relative z-10" aria-hidden="true">
            {icon}
          </span>
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900 tracking-wide">{title}</h3>
      {description && (
        <p className="mt-1.5 text-xs text-slate-600 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={action.onClick} className="ring-1 ring-slate-300 shadow-sm hover:ring-slate-300/80 bg-slate-100 hover:bg-slate-50 text-slate-900">
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
