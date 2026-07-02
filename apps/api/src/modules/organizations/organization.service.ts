import { OrganizationRepository } from './organization.repository.js';
import { AppError } from '../../core/errors/app-error.js';


export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}

  async listOrganizations(search?: string, page = 1, limit = 50): Promise<Record<string, unknown>> {
    return this.repository.listOrganizations(search, page, limit);
  }

  async createOrganization(name: string, ownerId: string, data: Record<string, unknown>) {
    return this.repository.createOrganizationWithDefaults(name, ownerId, data);
  }

  async getOrganization(id: string) {
    const org = await this.repository.getOrganizationById(id);
    if (!org) {
      throw AppError.notFound('Organization not found');
    }
    return org;
  }

  async updateOrganization(id: string, data: Record<string, unknown>) {
    const org = await this.repository.getOrganizationById(id);
    if (!org) {
      throw AppError.notFound('Organization not found');
    }
    return this.repository.updateOrganization(id, data);
  }

  async suspendOrganization(id: string) {
    const org = await this.repository.getOrganizationById(id);
    if (!org) {
      throw AppError.notFound('Organization not found');
    }
    const newStatus = org.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    return this.repository.updateOrganizationStatus(id, newStatus);
  }

  async deleteOrganization(id: string) {
    const org = await this.repository.getOrganizationById(id);
    if (!org) {
      throw AppError.notFound('Organization not found');
    }
    // Soft delete
    return this.repository.updateOrganizationStatus(id, 'DELETED', new Date());
  }

  async getOrganizationUsage(id: string) {
    const org = await this.repository.getOrganizationById(id);
    if (!org) {
      throw AppError.notFound('Organization not found');
    }
    return this.repository.getUsage(id);
  }
}
