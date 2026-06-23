export interface ScoringFactor {
  type: 'POSITIVE' | 'NEGATIVE';
  description: string;
}

export interface ScoreResult {
  score: number; // 0 to 100
  factors: ScoringFactor[];
  recommendation: string;
  modelVersion: string;
}

export interface LeadContext {
  lead: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    source: string;
    status: string;
    tags: string[];
    customFields: Record<string, unknown>;
  };
  activities: Array<{
    type: string;
    description: string;
    createdAt: string;
  }>;
}

export interface AiUsageStatus {
  periodMonth: string;
  callCount: number;
  tokenCount: number;
  quotaLimit: number;
  isOverQuota: boolean;
}
