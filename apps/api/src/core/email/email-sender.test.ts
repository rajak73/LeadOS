// Sprint 7 M1 — email sender unit tests. No network in CI: LoggingEmailSender is the
// default, SendGridEmailSender is exercised against a mocked fetch.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  LoggingEmailSender,
  SendGridEmailSender,
  getEmailSender,
  resetEmailSender,
} from './email-sender.js';
import { setFlag, resetFlags } from '../flags/flags.js';

afterEach(() => {
  resetFlags();
  resetEmailSender();
  vi.restoreAllMocks();
});

describe('LoggingEmailSender', () => {
  it('resolves without making a network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await new LoggingEmailSender().send({
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('SendGridEmailSender', () => {
  it('POSTs to the SendGrid API with auth + content', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 202 }));

    await new SendGridEmailSender('SG.key', 'from@leados.app', 'reply@leados.app').send({
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Body</p>',
      text: 'Body',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer SG.key');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from.email).toBe('from@leados.app');
    expect(body.personalizations[0].to[0].email).toBe('user@example.com');
  });

  it('throws when SendGrid returns a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad', { status: 401 }));
    await expect(
      new SendGridEmailSender('SG.key', 'from@leados.app').send({
        to: 'user@example.com',
        subject: 'S',
        html: 'h',
        text: 't',
      }),
    ).rejects.toThrow(/SendGrid send failed: 401/);
  });
});

describe('getEmailSender', () => {
  it('returns the logging sender when the email flag is off (default)', () => {
    setFlag('notifications.email.enabled', false);
    resetEmailSender();
    expect(getEmailSender()).toBeInstanceOf(LoggingEmailSender);
  });

  it('returns the logging sender when the flag is on but SendGrid is unconfigured', () => {
    // Test env has no SENDGRID_API_KEY/EMAIL_FROM, so even with the flag on it stays logging.
    setFlag('notifications.email.enabled', true);
    resetEmailSender();
    expect(getEmailSender()).toBeInstanceOf(LoggingEmailSender);
  });
});
