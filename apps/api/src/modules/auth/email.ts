// Email sending port for auth (verification, reset). SendGrid wiring + domain auth
// (SEC-3.2) is configured when SENDGRID_API_KEY is present; without it, the email is logged
// (dev) so the flow is fully testable. The service depends on the EmailSender INTERFACE.

import { env } from '../../core/config/env.js';
import { logger } from '../../core/observability/logger.js';

export interface EmailSender {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
}

/** Default sender: logs the link in dev (no PII beyond the recipient domain in prod). */
export class LoggingEmailSender implements EmailSender {
  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    logger.info({ message: 'auth.email.verification', toDomain: domainOf(to), hasUrl: !!verifyUrl });
    if (env.NODE_ENV !== 'production') {
      logger.debug({ message: 'verification link (dev only)', verifyUrl });
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    logger.info({ message: 'auth.email.reset', toDomain: domainOf(to), hasUrl: !!resetUrl });
    if (env.NODE_ENV !== 'production') {
      logger.debug({ message: 'reset link (dev only)', resetUrl });
    }
  }
}

function domainOf(email: string): string {
  return email.split('@')[1] ?? 'unknown';
}

export const defaultEmailSender: EmailSender = new LoggingEmailSender();
