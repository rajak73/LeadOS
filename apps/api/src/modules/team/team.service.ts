import { TeamRepository } from './team.repository.js';
import { AppError } from '../../core/errors/app-error.js';
import crypto from 'crypto';

export class TeamService {
  constructor(private readonly repository: TeamRepository) {}

  async inviteMember(organizationId: string, email: string, roleName: string) {
    const role = await this.repository.getRoleByName(organizationId, roleName);
    if (!role) {
      throw AppError.validation('Invalid role');
    }

    // In Phase 1, we just generate a token/link and return it.
    // Real implementation might create a TeamInvite record.
    const token = crypto.randomBytes(32).toString('hex');
    const invitationUrl = `https://app.leados.app/invite?token=${token}`;
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 7); // 7 days valid

    return {
      email,
      role: roleName,
      invitationUrl,
      token,
      expiresAt: expiration
    };
  }

  async updateRole(organizationId: string, userId: string, roleName: string) {
    const member = await this.repository.getMember(organizationId, userId);
    if (!member) throw AppError.notFound('Member not found');

    const role = await this.repository.getRoleByName(organizationId, roleName);
    if (!role) throw AppError.validation('Invalid role');

    return this.repository.updateMemberRole(organizationId, userId, role.id);
  }

  async removeMember(organizationId: string, userId: string) {
    const member = await this.repository.getMember(organizationId, userId);
    if (!member) throw AppError.notFound('Member not found');

    return this.repository.removeMember(organizationId, userId);
  }
}
