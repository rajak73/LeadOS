// Instagram account repository — org-scoped via withTenant pattern.
// Receives TenantTransactionClient from the calling service's withTenant callback.
// organizationId is injected automatically by the tenant extension.

import type { InstagramAccount, Prisma } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';

export interface CreateInstagramAccountData {
  igUserId: string;
  igUsername: string | null;
  platform?: 'INSTAGRAM' | 'FACEBOOK';
  facebookPageId?: string | null;
  accessToken: string; // already encrypted before passing here
  tokenExpiresAt: Date;
  tokenType: string;
  profilePictureUrl?: string;
  webhookSubscribed?: boolean;
}

export interface UpdateInstagramAccountData {
  igUsername?: string | null;
  accessToken?: string;
  tokenExpiresAt?: Date;
  tokenType?: string;
  status?: 'ACTIVE' | 'EXPIRED' | 'DISCONNECTED';
  webhookSubscribed?: boolean;
  profilePictureUrl?: string | null;
  deletedAt?: Date;
}

export class PrismaInstagramAccountRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: CreateInstagramAccountData): Promise<InstagramAccount> {
    return this.db.instagramAccount.create({
      data: asTenantCreate<Prisma.InstagramAccountUncheckedCreateInput>({
        igUserId: data.igUserId,
        igUsername: data.igUsername ?? null,
        platform: data.platform ?? 'INSTAGRAM',
        facebookPageId: data.facebookPageId ?? null,
        accessToken: data.accessToken,
        tokenExpiresAt: data.tokenExpiresAt,
        tokenType: data.tokenType,
        status: 'ACTIVE',
        webhookSubscribed: data.webhookSubscribed ?? false,
        profilePictureUrl: data.profilePictureUrl ?? null,
      }),
    });
  }

  async count(): Promise<number> {
    return this.db.instagramAccount.count({ where: { deletedAt: null } });
  }

  async findAll(): Promise<InstagramAccount[]> {
    return this.db.instagramAccount.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<InstagramAccount | null> {
    return this.db.instagramAccount.findFirst({ where: { id, deletedAt: null } });
  }

  async findByIdOrThrow(id: string): Promise<InstagramAccount> {
    const account = await this.findById(id);
    if (!account) {
      throw new AppError(ErrorCode.INSTAGRAM_ACCOUNT_NOT_FOUND, `Instagram account ${id} not found`);
    }
    return account;
  }

  async update(id: string, data: UpdateInstagramAccountData): Promise<InstagramAccount> {
    return this.db.instagramAccount.update({ where: { id }, data });
  }

  async isIgUserIdConnected(igUserId: string): Promise<boolean> {
    const count = await this.db.instagramAccount.count({
      where: { igUserId, deletedAt: null },
    });
    return count > 0;
  }
}
