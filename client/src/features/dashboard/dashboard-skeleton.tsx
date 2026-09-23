import { Card } from '@/components/ui/card';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

function ChartSkeleton({ className, rows }: { className?: string; rows?: number }) {
  return (
    <Card className={className}>
      <div className="space-y-2 px-4 pt-4 pb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3.5 w-44" />
      </div>
      <div className="px-4 pb-5">
        {rows ? (
          <div className="space-y-3">
            {Array.from({ length: rows }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </div>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard…" className="@container flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className="min-w-40 flex-1 basis-40 space-y-3 p-4 @xl:basis-52">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3.5 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 @4xl:grid-cols-3">
        <ChartSkeleton className="@4xl:col-span-2" />
        <ChartSkeleton rows={4} />
      </div>
      <div className="grid gap-4 @4xl:grid-cols-3">
        <ChartSkeleton rows={5} />
        <ChartSkeleton rows={5} />
        <ChartSkeleton rows={5} />
      </div>
    </LoadingRegion>
  );
}
