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
        <span className="text-3xl mb-3 select-none" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-text-tertiary max-w-xs leading-relaxed">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={action.onClick}>
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
