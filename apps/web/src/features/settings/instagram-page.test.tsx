import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { InstagramStatus } from '@leados/shared';
import { mockFetch } from '@/test/fetch-mock';
import { renderWithRouter } from '@/test/utils';
import InstagramSettingsPage from './instagram-page';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

const status: InstagramStatus = {
  connected: false,
  account: null,
  webhook: {
    callbackUrl: 'http://localhost:4000/api/webhooks/instagram',
    verifyToken: 'leados-verify-123',
    isPublicUrl: false,
  },
  appSecretConfigured: false,
  testMode: true,
};

describe('InstagramSettingsPage', () => {
  it('guides setup with copyable webhook values and localhost warnings', async () => {
    mockFetch({ 'GET /instagram/status': status });
    renderWithRouter(<InstagramSettingsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Connect your Instagram account' }),
    ).toBeInTheDocument();
    expect(screen.getByText(status.webhook.callbackUrl)).toBeInTheDocument();
    expect(screen.getByText(status.webhook.verifyToken)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy callback URL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy verify token' })).toBeInTheDocument();

    expect(screen.getByText("Meta can't reach this address")).toBeInTheDocument();
    expect(screen.getByText('cloudflared tunnel --url http://localhost:4000')).toBeInTheDocument();
    expect(screen.getByText("The app secret isn't set")).toBeInTheDocument();

    expect(screen.getByText('Test mode — nothing is sent to Instagram')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Simulate incoming' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Access token/)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('hides the warnings when the URL is public and the secret is set', async () => {
    mockFetch({
      'GET /instagram/status': {
        ...status,
        testMode: false,
        appSecretConfigured: true,
        webhook: { ...status.webhook, isPublicUrl: true },
      },
    });
    renderWithRouter(<InstagramSettingsPage />);
    await screen.findByRole('heading', { name: 'Connect your Instagram account' });
    expect(screen.queryByText("Meta can't reach this address")).not.toBeInTheDocument();
    expect(screen.queryByText("The app secret isn't set")).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Simulate incoming' })).not.toBeInTheDocument();
  });
});
