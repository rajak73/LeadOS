import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { LeadStatusBadge } from './LeadStatusBadge';
import { renderWithProviders } from '@/test-utils';
import type { LeadStatus } from '@/lib/types/api';

describe('LeadStatusBadge', () => {
  const cases: [LeadStatus, string][] = [
    ['NEW', 'New'],
    ['CONTACTED', 'Contacted'],
    ['QUALIFIED', 'Qualified'],
    ['WON', 'Won'],
    ['LOST', 'Lost'],
  ];

  cases.forEach(([status, label]) => {
    it(`renders "${label}" for status ${status}`, () => {
      renderWithProviders(<LeadStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByTestId(`status-badge-${status}`)).toBeInTheDocument();
    });
  });
});
