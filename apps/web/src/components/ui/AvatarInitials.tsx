interface AvatarInitialsProps {
  name: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-xs',
};

export function AvatarInitials({ name, size = 'md', className = '' }: AvatarInitialsProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full bg-primary-500/15 text-primary-400 border border-primary-500/20 flex items-center justify-center font-medium shrink-0 select-none ${className}`}
      aria-hidden="true"
      title={name}
    >
      {initials || '?'}
    </div>
  );
}
