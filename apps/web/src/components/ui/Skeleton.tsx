type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-bg-muted/80 ${className ?? ''}`}
      {...props}
    />
  );
}
