import { prisma } from '../../src/core/prisma/client.js';

async function fetchApi(path: string, token?: string, method = 'GET', body?: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`http://localhost:4000${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(email: string) {
  const res = await fetchApi('/api/v1/auth/login', undefined, 'POST', {
    email,
    password: 'LeadOS@123'
  });
  if (res.status === 200 && res.data?.data?.accessToken) return res.data.data.accessToken;
  throw new Error(`Login failed for ${email}`);
}

async function main() {
  console.log('--- 1. API Health Check ---');
  const health = await fetchApi('/api/v1/health');
  console.log('Health:', health.status, health.data);
  
  console.log('\n--- 2. Login Super Admin vs Owner ---');
  const superToken = await login('superadmin@leados.demo');
  const ownerToken = await login('owner@technova.demo');
  console.log('Tokens retrieved.');

  console.log('\n--- 3. Super Admin API Check ---');
  const orgsSuper = await fetchApi('/api/v1/admin/organizations', superToken);
  console.log('Superadmin GET /organizations:', orgsSuper.status); // Expect 200

  const orgsOwner = await fetchApi('/api/v1/admin/organizations', ownerToken);
  console.log('Owner GET /organizations:', orgsOwner.status); // Expect 403 or 401

  console.log('\n--- 4. Tenant Isolation Check ---');
  // Find a TechNova lead ID
  const techNova = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  const lead = await prisma.lead.findFirst({ where: { organizationId: techNova!.id, status: 'NEW' } });
  
  // Login as GrowthBridge
  const gbToken = await login('owner@growthbridge.demo');
  const gbLeadRes = await fetchApi(`/api/v1/leads/${lead!.id}`, gbToken);
  console.log('GrowthBridge accessing TechNova Lead:', gbLeadRes.status); // Expect 403 or 404

  console.log('\n--- 5. Suspended Organization Check ---');
  const demoOrg = await prisma.organization.findFirst({ where: { slug: 'growthbridge' } });
  
  // Suspend GrowthBridge
  await prisma.organization.update({
    where: { id: demoOrg!.id },
    data: { status: 'SUSPENDED' }
  });
  console.log('Suspended GrowthBridge.');
  
  const gbCheckRes = await fetchApi(`/api/v1/leads`, gbToken);
  console.log('Suspended Org access API:', gbCheckRes.status, gbCheckRes.data?.error); // Expect 403 or 401
  
  // Reactivate
  await prisma.organization.update({
    where: { id: demoOrg!.id },
    data: { status: 'ACTIVE' }
  });
  console.log('Reactivated GrowthBridge.');
  const gbCheckRes2 = await fetchApi(`/api/v1/leads`, gbToken);
  console.log('Reactivated Org access API:', gbCheckRes2.status); // Expect 200

}

main().catch(console.error).finally(() => process.exit(0));
