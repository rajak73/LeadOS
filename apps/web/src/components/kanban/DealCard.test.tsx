import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DealCard } from './DealCard';
import { renderWithProviders, makeDeal } from '@/test-utils';

// @dnd-kit/sortable useSortable is wired to real DOM — stub the sensor interaction
vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    }),
  };
});

const mockMarkWon = vi.fn();
const mockMarkLost = vi.fn();

describe('DealCard', () => {
  it('renders deal title', () => {
    const deal = makeDeal({ title: 'Acme Corp Deal' });
    renderWithProviders(
      <DealCard deal={deal} onMarkWon={mockMarkWon} onMarkLost={mockMarkLost} />,
    );
    expect(screen.getByText('Acme Corp Deal')).toBeInTheDocument();
  });

  it('renders formatted value when present', () => {
    const deal = makeDeal({ value: '75000' });
    renderWithProviders(
      <DealCard deal={deal} onMarkWon={mockMarkWon} onMarkLost={mockMarkLost} />,
    );
    expect(screen.getByText(/75,000/)).toBeInTheDocument();
  });

  it('shows overdue badge when past expected close and open', () => {
    const deal = makeDeal({
      expectedCloseDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'OPEN',
    });
    renderWithProviders(
      <DealCard deal={deal} onMarkWon={mockMarkWon} onMarkLost={mockMarkLost} />,
    );
    expect(screen.getByText('OVERDUE')).toBeInTheDocument();
  });

  it('calls onMarkWon when Won button clicked', async () => {
    const user = userEvent.setup();
    const deal = makeDeal();
    renderWithProviders(
      <DealCard deal={deal} onMarkWon={mockMarkWon} onMarkLost={mockMarkLost} />,
    );
    const wonBtn = screen.getByRole('button', { name: /won/i });
    await user.click(wonBtn);
    expect(mockMarkWon).toHaveBeenCalledWith('deal-1');
  });

  it('calls onMarkLost when Lost button clicked', async () => {
    const user = userEvent.setup();
    const deal = makeDeal();
    renderWithProviders(
      <DealCard deal={deal} onMarkWon={mockMarkWon} onMarkLost={mockMarkLost} />,
    );
    const lostBtn = screen.getByRole('button', { name: /lost/i });
    await user.click(lostBtn);
    expect(mockMarkLost).toHaveBeenCalledWith('deal-1');
  });

  it('does not show action buttons for WON deal', () => {
    const deal = makeDeal({ status: 'WON' });
    renderWithProviders(
      <DealCard deal={deal} onMarkWon={mockMarkWon} onMarkLost={mockMarkLost} />,
    );
    expect(screen.queryByRole('button', { name: /won/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lost/i })).not.toBeInTheDocument();
  });
});
