// Frontend API types. Wraps Prisma-returned shapes for use in components.
// Source of truth for field names is the Prisma schema + API serialization layer.

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  color: string | null;
  probability: number | null;
  isWon: boolean;
  isLost: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: PipelineStage[];
  createdAt: string;
  updatedAt: string;
}

export type DealStatus = 'OPEN' | 'WON' | 'LOST';

export interface Deal {
  id: string;
  organizationId: string;
  title: string;
  value: string | null;
  currency: string;
  pipelineId: string;
  stageId: string;
  leadId: string | null;
  contactId: string | null;
  assignedToId: string | null;
  createdById: string;
  status: DealStatus;
  closedAt: string | null;
  lostReason: string | null;
  expectedCloseDate: string | null;
  customFields: Record<string, unknown>;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  activityType: string;
  metadata: Record<string, unknown>;
  actorId: string;
  createdAt: string;
}

export interface ForecastRow {
  stageId: string;
  stageName: string;
  probability: number | null;
  totalValue: number;
  weightedValue: number;
  dealCount: number;
}

export type DealHealth = 'stale' | 'overdue' | 'high-value';

const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
export const HIGH_VALUE_THRESHOLD = 50_000;

export function getDealHealth(deal: Deal): DealHealth[] {
  const health: DealHealth[] = [];
  if (deal.status !== 'OPEN') return health;

  const updatedAt = new Date(deal.updatedAt).getTime();
  if (Date.now() - updatedAt > STALE_THRESHOLD_MS) health.push('stale');

  if (deal.expectedCloseDate && new Date(deal.expectedCloseDate) < new Date()) {
    health.push('overdue');
  }

  if (deal.value && Number(deal.value) > HIGH_VALUE_THRESHOLD) health.push('high-value');

  return health;
}

export function formatCurrency(value: string | number | null, currency = 'INR'): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
