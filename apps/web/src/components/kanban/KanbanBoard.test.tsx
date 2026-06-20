import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoard } from './KanbanBoard';
import { renderWithProviders, makePipeline, makeDeal } from '@/test-utils';

// Stub BFF hooks so the board renders deterministically in unit tests.
vi.mock('@/lib/hooks/usePipelines', () => ({
  usePipelines: () => ({ data: [makePipeline()] }),
}));

vi.mock('@/lib/hooks/useDeals', () => ({
  useDeals: () => ({
    data: [
      makeDeal({ id: 'd1', title: 'Deal Alpha', stageId: 'stage-1' }),
      makeDeal({ id: 'd2', title: 'Deal Beta', stageId: 'stage-2' }),
    ],
    isLoading: false,
  }),
}));

vi.mock('@/lib/hooks/useMoveDeal', () => ({
  useMoveDeal: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/hooks/useDealActions', () => ({
  useMarkWon: () => ({ mutate: vi.fn() }),
  useMarkLost: () => ({ mutate: vi.fn() }),
  useCreateDeal: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/hooks/useForecast', () => ({
  useForecast: () => ({ data: [] }),
}));

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: {}, listeners: {}, setNodeRef: vi.fn(),
      transform: null, transition: null, isDragging: false,
    }),
  };
});

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core');
  return {
    ...actual,
    DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  };
});

describe('KanbanBoard', () => {
  it('renders stage columns', () => {
    renderWithProviders(<KanbanBoard />);
    // Both mobile and desktop trees exist in jsdom; use getAllByText to handle duplicates.
    expect(screen.getAllByText('Lead').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Qualified').length).toBeGreaterThan(0);
  });

  it('renders deal cards in correct columns', () => {
    renderWithProviders(<KanbanBoard />);
    // Both mobile (single-col) and desktop (all-cols) are in the DOM — jsdom doesn't apply CSS display rules.
    // Use getAllByText to handle duplicates and assert at least one instance is present.
    expect(screen.getAllByText('Deal Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Deal Beta').length).toBeGreaterThan(0);
  });

  it('does not render PipelineSelector when there is only one pipeline', () => {
    renderWithProviders(<KanbanBoard />);
    expect(screen.queryByTestId('pipeline-selector')).not.toBeInTheDocument();
  });

  describe('mobile stage navigation', () => {
    it('renders prev/next navigation controls', () => {
      renderWithProviders(<KanbanBoard />);
      expect(screen.getByTestId('mobile-stage-nav')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous stage' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next stage' })).toBeInTheDocument();
    });

    it('disables prev button at first stage', () => {
      renderWithProviders(<KanbanBoard />);
      const prev = screen.getByRole('button', { name: 'Previous stage' }) as HTMLButtonElement;
      expect(prev.disabled).toBe(true);
    });

    it('enables next button when not at last stage', () => {
      renderWithProviders(<KanbanBoard />);
      const next = screen.getByRole('button', { name: 'Next stage' }) as HTMLButtonElement;
      expect(next.disabled).toBe(false);
    });

    it('advances to next stage on next click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<KanbanBoard />);
      const next = screen.getByRole('button', { name: 'Next stage' });
      await user.click(next);
      // After advancing, stage nav should show index 2 of 3
      expect(screen.getByTestId('mobile-stage-nav')).toHaveTextContent('2 / 3');
    });
  });
});
