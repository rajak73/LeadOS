import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CsvImportModal } from './CsvImportModal';
import { renderWithProviders } from '@/test-utils';

describe('CsvImportModal', () => {
  it('does not render when closed', () => {
    renderWithProviders(<CsvImportModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('csv-import-modal')).not.toBeInTheDocument();
  });

  it('renders the file input when open', () => {
    renderWithProviders(<CsvImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('csv-import-modal')).toBeInTheDocument();
    expect(screen.getByTestId('file-input')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<CsvImportModal open={true} onClose={onClose} />);
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
