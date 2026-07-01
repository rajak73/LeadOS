import crypto from 'node:crypto';

// Manual QA Script: Simulate a WhatsApp webhook safely using local API and fake payload
// Usage: tsx simulate-whatsapp-webhook.ts

const API_URL = 'http://localhost:3001/api/webhooks/whatsapp';
const META_APP_SECRET = process.env.META_APP_SECRET || 'test_secret';

const fakePayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'mock_waba_id',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '1234567890',
              phone_number_id: 'mock_phone_number_id',
            },
            contacts: [
              {
                profile: { name: 'Test User' },
                wa_id: '12345678901',
              },
            ],
            messages: [
              {
                from: '12345678901',
                id: `wamid.${Date.now()}`,
                timestamp: Math.floor(Date.now() / 1000).toString(),
                text: { body: process.argv[2] || 'Hello, this is a simulated WhatsApp message for smoke testing!' },
                type: 'text',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

const rawBody = JSON.stringify(fakePayload);

// Compute HMAC signature to pass verification
const computedSignature = crypto
  .createHmac('sha256', META_APP_SECRET)
  .update(rawBody)
  .digest('hex');

async function run() {
  console.log('Sending mock WhatsApp webhook payload...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${computedSignature}`,
      },
      body: rawBody,
    });

    if (res.ok) {
      console.log('✅ Webhook successfully accepted by the ingestion endpoint!');
      console.log('Response:', await res.json());
      console.log('Event is now saved as PENDING in the WebhookEvent table.');
    } else {
      console.error('❌ Webhook rejected:', res.status, res.statusText);
      console.error(await res.text());
    }
  } catch (err) {
    console.error('❌ Failed to send request:', err);
  }
}

run();
