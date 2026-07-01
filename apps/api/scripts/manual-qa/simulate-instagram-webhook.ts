import crypto from 'node:crypto';

// Manual QA Script: Simulate an Instagram webhook safely using local API and fake payload
// Usage: tsx simulate-instagram-webhook.ts

const API_URL = 'http://localhost:3001/api/webhooks/instagram';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || 'test_secret';

const fakePayload = {
  object: 'instagram',
  entry: [
    {
      id: 'mock_ig_account_id',
      time: Math.floor(Date.now() / 1000),
      messaging: [
        {
          sender: { id: 'mock_sender_ig_id' },
          recipient: { id: 'mock_ig_account_id' },
          timestamp: Date.now(),
          message: {
            mid: `mid.$cAAAAA_${Date.now()}`,
            text: 'Hello, this is a simulated Instagram message for smoke testing!',
          },
        },
      ],
    },
  ],
};

const rawBody = JSON.stringify(fakePayload);

// Compute HMAC signature to pass verification
const computedSignature = crypto
  .createHmac('sha256', INSTAGRAM_APP_SECRET)
  .update(rawBody)
  .digest('hex');

async function run() {
  console.log('Sending mock Instagram webhook payload...');
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
