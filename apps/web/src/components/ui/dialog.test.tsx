import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogTrigger } from './dialog';

function Harness() {
  return (
    <>
      <p>Page behind the dialog</p>
      <Dialog>
        <DialogTrigger>Add lead</DialogTrigger>
        <DialogContent title="Add lead">
          <input aria-label="First name" />
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('DialogContent', () => {
  it('stays open when the user taps outside it', async () => {
    // The open modal sets pointer-events: none on the page; tap it anyway, as a finger would.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add lead' }));
    await user.type(await screen.findByLabelText('First name'), 'Priya');

    await user.click(document.body);

    expect(screen.getByRole('dialog', { name: 'Add lead' })).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Priya');
  });

  it('closes with the ✕ button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add lead' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
