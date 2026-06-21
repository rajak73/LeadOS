import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposeBar } from './ComposeBar';

function setup(onSend = vi.fn()) {
  render(<ComposeBar conversationId="conv-1" onSend={onSend} />);
  return { onSend };
}

describe('ComposeBar', () => {
  it('renders a textarea and Send button', () => {
    setup();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('Send button is disabled when textarea is empty', () => {
    setup();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('calls onSend and clears textarea on button click', async () => {
    const user = userEvent.setup();
    const { onSend } = setup();
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello world');
    await user.click(screen.getByRole('button', { name: /send/i }));
    expect(onSend).toHaveBeenCalledWith('Hello world');
    expect(textarea).toHaveValue('');
  });

  it('calls onSend on Enter (without shift)', async () => {
    const user = userEvent.setup();
    const { onSend } = setup();
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Enter test');
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('Enter test');
  });

  it('does not send on Shift+Enter', async () => {
    const user = userEvent.setup();
    const { onSend } = setup();
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'New line');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows Sending… and disables when isSending=true', () => {
    render(<ComposeBar conversationId="conv-1" onSend={vi.fn()} isSending />);
    expect(screen.getByRole('button')).toHaveTextContent('Sending…');
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
