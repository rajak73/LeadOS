import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Get a GrowthBridge Contact ID
  const gbOrg = await prisma.organization.findUnique({ where: { slug: 'growthbridge' } });
  const gbContact = await prisma.contact.findFirst({ where: { organizationId: gbOrg!.id } });
  
  if (!gbContact) {
    console.log("No GrowthBridge contact found.");
    return;
  }
  
  console.log(`GrowthBridge Contact ID: ${gbContact.id}`);

  // 2. Login as TechNova to get token
  const loginRes = await fetch('http://localhost:4000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@technova.demo', password: 'LeadOS@123' })
  });
  
  const loginData = await loginRes.json();
  const token = loginData.data.accessToken;
  
  // 3. Attempt to fetch the GrowthBridge contact using TechNova token
  const fetchRes = await fetch(`http://localhost:4000/api/v1/customers/${gbContact.id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log(`Isolation Test Status: ${fetchRes.status}`);
  const resultData = await fetchRes.text();
  console.log(`Isolation Test Body: ${resultData.substring(0, 100)}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
