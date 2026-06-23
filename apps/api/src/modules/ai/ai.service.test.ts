import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockAiAdapter, OpenAiAdapter } from './ai.adapter.js';
import { AiService } from './ai.service.js';
import type { LeadContext, ScoreResult } from '@leados/shared';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { cacheRedis } from '../../core/redis/client.js';
import { createHash } from 'node:crypto';

// Mock Redis client
vi.mock('../../core/redis/client.js', () => {
  const mockPipeline = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  };

  const mockRedis = {
    pipeline: vi.fn(() => mockPipeline),
    zadd: vi.fn(),
    expire: vi.fn(),
    hgetall: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    set: vi.fn(),
    hset: vi.fn(),
  };

  return {
    cacheRedis: mockRedis,
  };
});

describe('AI Modules & Services', () => {
  let mockDb: any;
  let mockPipeline: any;
  const fixedDate = new Date('2026-06-22T10:00:00.000Z');

  beforeEach(() => {
    vi.restoreAllMocks();

    mockPipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 0], [null, 0]]),
    };

    vi.mocked(cacheRedis.pipeline).mockReturnValue(mockPipeline as any);
    (vi.mocked(cacheRedis.zadd) as any).mockResolvedValue(1);
    (vi.mocked(cacheRedis.expire) as any).mockResolvedValue(1);
    vi.mocked(cacheRedis.hgetall).mockResolvedValue({});
    vi.mocked(cacheRedis.get).mockResolvedValue(null);
    (vi.mocked(cacheRedis.del) as any).mockResolvedValue(1);
    (vi.mocked(cacheRedis.incr) as any).mockResolvedValue(1);
    vi.mocked(cacheRedis.set).mockResolvedValue('OK');
    (vi.mocked(cacheRedis.hset) as any).mockResolvedValue(1);

    mockDb = {
      lead: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'lead-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: null,
          source: 'MANUAL',
          status: 'NEW',
          tags: [],
          customFields: {},
          createdAt: fixedDate,
          updatedAt: fixedDate,
        }),
      },
      activity: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      subscription: {
        findUnique: vi.fn().mockResolvedValue({
          plan: 'TRIAL',
        }),
      },
      aiUsageCounter: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
  });

  describe('MockAiAdapter', () => {
    it('scores lead with email and manual source correctly', async () => {
      const adapter = new MockAiAdapter();
      const context: LeadContext = {
        lead: {
          id: 'lead-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: null,
          source: 'MANUAL',
          status: 'NEW',
          tags: [],
          customFields: {},
        },
        activities: [],
      };

      const result = await adapter.scoreLead(context);
      expect(result.score).toBe(70); // 50 (base) + 20 (email)
      expect(result.factors).toEqual([
        { type: 'POSITIVE', description: 'Has email address (+20)' },
      ]);
      expect(result.modelVersion).toBe('mock-model-v1');
    });
  });

  describe('OpenAiAdapter', () => {
    it('throws when scoreLead is called on skeleton', async () => {
      const adapter = new OpenAiAdapter('test-key');
      const context: LeadContext = {
        lead: {
          id: 'lead-3',
          firstName: 'Bob',
          lastName: null,
          email: null,
          phone: null,
          source: 'REFERRAL',
          status: 'NEW',
          tags: [],
          customFields: {},
        },
        activities: [],
      };

      await expect(adapter.scoreLead(context)).rejects.toThrow(
        'OpenAiAdapter.scoreLead is not implemented yet.',
      );
    });
  });

  describe('AiService', () => {
    it('scores lead successfully when quota and limits are under cap', async () => {
      const service = new AiService(new MockAiAdapter());
      const db = mockDb as unknown as TenantTransactionClient;

      const result = await service.scoreLead(db, 'org-1', 'lead-1');
      expect(result.score).toBe(70);
      expect(mockDb.lead.findUnique).toHaveBeenCalledWith({ where: { id: 'lead-1' } });
      expect(mockDb.aiUsageCounter.upsert).toHaveBeenCalled();
    });

    it('throws AI_QUOTA_EXCEEDED when monthly limit is exceeded', async () => {
      mockDb.aiUsageCounter.findUnique.mockResolvedValue({
        callCount: 501,
      });

      const service = new AiService(new MockAiAdapter());
      const db = mockDb as unknown as TenantTransactionClient;

      await expect(service.scoreLead(db, 'org-1', 'lead-1')).rejects.toThrow(
        'Monthly AI scoring quota exceeded',
      );
    });

    it('throws RATE_LIMITED when hourly rate limit is exceeded', async () => {
      mockPipeline.exec.mockResolvedValue([[null, 0], [null, 60]]); // limit is 50 for TRIAL

      const service = new AiService(new MockAiAdapter());
      const db = mockDb as unknown as TenantTransactionClient;

      await expect(service.scoreLead(db, 'org-1', 'lead-1')).rejects.toThrow(
        'Hourly AI rate limit exceeded',
      );
    });

    it('throws AI_PROVIDER_UNAVAILABLE when circuit breaker is open', async () => {
      vi.mocked(cacheRedis.get).mockResolvedValue('true'); // breaker open

      const service = new AiService(new MockAiAdapter());
      const db = mockDb as unknown as TenantTransactionClient;

      await expect(service.scoreLead(db, 'org-1', 'lead-1')).rejects.toThrow(
        'AI provider is temporarily unavailable (circuit breaker open)',
      );
    });

    it('resolves score from cache directly without calling the adapter when cached', async () => {
      const cachedScore: ScoreResult = {
        score: 95,
        factors: [{ type: 'POSITIVE', description: 'Cached positive factors' }],
        recommendation: 'Immediate action',
        modelVersion: 'cached-v1',
      };

      const payloadForHash = {
        status: 'NEW',
        tags: [],
        source: 'MANUAL',
        email: 'john@example.com',
        phone: null,
        customFields: {},
        lastActivityAt: fixedDate.toISOString(),
      };
      const expectedHash = createHash('sha256').update(JSON.stringify(payloadForHash)).digest('hex');

      vi.mocked(cacheRedis.hgetall).mockResolvedValue({
        hash: expectedHash,
        score: JSON.stringify(cachedScore),
      });

      const service = new AiService(new MockAiAdapter());
      const db = mockDb as unknown as TenantTransactionClient;

      const result = await service.scoreLead(db, 'org-1', 'lead-1');
      expect(result.score).toBe(95);
      expect(result.modelVersion).toBe('cached-v1');
    });

    it('returns the monthly usage status correctly', async () => {
      mockDb.aiUsageCounter.findUnique.mockResolvedValue({
        callCount: 150,
        tokenCount: 4500,
      });

      const service = new AiService(new MockAiAdapter());
      const db = mockDb as unknown as TenantTransactionClient;

      const usage = await service.getUsageStatus(db, 'org-1');
      expect(usage.callCount).toBe(150);
      expect(usage.quotaLimit).toBe(500); // TRIAL plan limit
      expect(usage.isOverQuota).toBe(false);
    });
  });
});
