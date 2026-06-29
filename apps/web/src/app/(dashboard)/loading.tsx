import { Spinner } from '@/components/ui/Spinner';

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] w-full">
      <div className="space-y-4 text-center">
        <Spinner size="lg" />
        <p className="text-sm text-text-secondary animate-pulse">Loading...</p>
      </div>
    </div>
  );
}
