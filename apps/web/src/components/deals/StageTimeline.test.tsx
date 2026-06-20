import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StageTimeline } from './StageTimeline';
import { renderWithProviders, makeDeal, makePipeline } from '@/test-utils';

const mockMoveDeal = vi.fn();

vi.mock('@/lib/hooks/useMoveDeal', () => ({
  useMoveDeal: () => ({ mutate: mockMoveDeal, isPending: false }),
}));

describe('StageTimeline', () => {
  const pipeline = makePipeline();
  const openDeal = makeDeal({ pipelineId: 'pipe-1', stageId: 'stage-1', status: 'OPEN' });

  it('renders all stage buttons', () => {
    renderWithProviders(<StageTimeline deal={openDeal} pipeline={pipeline} onMarkWon={vi.fn()} />);
    expect(screen.getByTestId('stage-btn-stage-1')).toBeInTheDocument();
    expect(screen.getByTestId('stage-btn-stage-2')).toBeInTheDocument();
    expect(screen.getByTestId('stage-btn-stage-won')).toBeInTheDocument();
  });

  it('calls moveDeal when clicking a different stage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StageTimeline deal={openDeal} pipeline={pipeline} onMarkWon={vi.fn()} />);
    await user.click(screen.getByTestId('stage-btn-stage-2'));
    expect(mockMoveDeal).toHaveBeenCalledWith(
      expect.objectContaining({ stageId: 'stage-2' }),
      expect.any(Object),
    );
  });

  it('calls onMarkWon when clicking the won stage', async () => {
    const user = userEvent.setup();
    const onMarkWon = vi.fn();
    renderWithProviders(<StageTimeline deal={openDeal} pipeline={pipeline} onMarkWon={onMarkWon} />);
    await user.click(screen.getByTestId('stage-btn-stage-won'));
    expect(onMarkWon).toHaveBeenCalled();
  });

  it('disables all stage buttons for closed deals', () => {
    const wonDeal = makeDeal({ status: 'WON', stageId: 'stage-won' });
    renderWithProviders(<StageTimeline deal={wonDeal} pipeline={pipeline} onMarkWon={vi.fn()} />);
    const stage1Btn = screen.getByTestId('stage-btn-stage-1') as HTMLButtonElement;
    expect(stage1Btn.disabled).toBe(true);
  });

  it('renders nothing when pipeline is null', () => {
    renderWithProviders(
      <StageTimeline deal={openDeal} pipeline={null} onMarkWon={vi.fn()} />,
    );
    expect(screen.queryByTestId('stage-timeline')).not.toBeInTheDocument();
  });
});
