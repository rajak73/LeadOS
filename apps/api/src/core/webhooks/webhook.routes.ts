// Webhook routes (SEC-5 carve-out). Inbound webhooks need the RAW request body to verify
// HMAC signatures (doc 19 §19.4), so these routes are mounted with express.raw() BEFORE the
// global JSON parser in app.ts. Sprint 1 ships only the raw-body capture proof; real
// Instagram/Stripe receivers (with signature verification) land in S6/S8.

import { Router, type Request } from 'express';

export const webhookRouter: Router = Router();

// Proof that the raw body is available (a Buffer) on webhook routes.
webhookRouter.post('/_echo', (req: Request, res) => {
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  res.status(200).json({ received: true, rawBytes: raw.length });
});
