// Frontend API types. Wraps Prisma-returned shapes for use in components.
// Source of truth for field names is the Prisma schema + API serialization layer.

export type InstagramAccountStatus = 'ACTIVE' | 'EXPIRED' | 'DISCONNECTED';

export interface InstagramAccount {
  id: string;
  organizationId: string;
  igUserId: string;
  igUsername: string | null;
  status: InstagramAccountStatus;
  tokenExpiresAt: string;
  webhookSubscribed: boolean;
  profilePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

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

// ─── Lead types ────────────────────────────────────────────────────────────

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';

export type LeadSource =
  | 'INSTAGRAM_DM'
  | 'INSTAGRAM_COMMENT'
  | 'WHATSAPP'
  | 'MANUAL'
  | 'IMPORT'
  | 'REFERRAL'
  | 'WEB_FORM'
  | 'OTHER';

export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'PROPOSAL', 'LOST'],
  QUALIFIED: ['PROPOSAL', 'NEGOTIATION', 'LOST'],
  PROPOSAL: ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['LOST'],
  WON: [],
  LOST: [],
};

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST',
];

export const ALL_LEAD_SOURCES: LeadSource[] = [
  'INSTAGRAM_DM', 'INSTAGRAM_COMMENT', 'WHATSAPP', 'MANUAL', 'IMPORT', 'REFERRAL', 'WEB_FORM', 'OTHER',
];

export interface Lead {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  status: LeadStatus;
  assignedToId: string | null;
  aiScore: number | null;
  aiScoreUpdatedAt: string | null;
  instagramHandle: string | null;
  instagramUserId: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  lostReason: string | null;
  convertedToContactId: string | null;
  lastActivityAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LeadNote {
  id: string;
  // content is stored as JSONB (Prisma Json field). The plain-textarea flow stores
  // { text: string }; the Tiptap flow (Sprint 6+) will store a ProseMirror document.
  content: Record<string, unknown>;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export function getNoteText(content: Record<string, unknown>): string {
  if (typeof content['text'] === 'string') return content['text'];
  return JSON.stringify(content);
}

export interface LeadFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string | null;
  createdAt: string;
}

export interface LeadListQuery {
  status?: LeadStatus[];
  source?: LeadSource[];
  assignedToId?: string;
  tags?: string[];
  aiScoreMin?: number;
  aiScoreMax?: number;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  sortBy?: 'firstName' | 'createdAt' | 'aiScore';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export function getLeadDisplayName(lead: Lead): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ');
}

export function formatLeadStatus(status: LeadStatus): string {
  const labels: Record<LeadStatus, string> = {
    NEW: 'New',
    CONTACTED: 'Contacted',
    QUALIFIED: 'Qualified',
    PROPOSAL: 'Proposal',
    NEGOTIATION: 'Negotiation',
    WON: 'Won',
    LOST: 'Lost',
  };
  return labels[status];
}

export function formatLeadSource(source: LeadSource): string {
  const labels: Record<LeadSource, string> = {
    INSTAGRAM_DM: 'Instagram DM',
    INSTAGRAM_COMMENT: 'Instagram Comment',
    WHATSAPP: 'WhatsApp',
    MANUAL: 'Manual',
    IMPORT: 'Import',
    REFERRAL: 'Referral',
    WEB_FORM: 'Web Form',
    OTHER: 'Other',
  };
  return labels[source];
}

// ─── End Lead types ─────────────────────────────────────────────────────────

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
