import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposeBar } from './ComposeBar';
import type { SavedReply } from '@/lib/types/api';

// Mutable so individual tests can inject saved replies without full module reload
let mockSavedReplies: SavedReply[] = [];

// Stub useSavedReplies — ComposeBar calls this hook; its network behaviour is tested separately
vi.mock('@/lib/hooks/useSavedReplies', () => ({
  useSavedReplies: () => ({ data: mockSavedReplies }),
}));

function makeSavedReply(overrides: Partial<SavedReply> = {}): SavedReply {
  return {
    id: 'sr-1',
    organizationId: 'org-1',
    title: 'Greeting',
    content: 'Hello! How can I help you today?',
    shortcut: '/hi',
    isGlobal: true,
    createdById: 'u-1',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    ...overrides,
  };
}

function setup(onSend = vi.fn()) {
  render(<ComposeBar conversationId="conv-1" onSend={onSend} />);
  return { onSend };
}

describe('ComposeBar', () => {
  beforeEach(() => {
    mockSavedReplies = [];
  });

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
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('opens SavedReplyPicker when "/" is typed in the textarea', async () => {
    mockSavedReplies = [makeSavedReply()];
    const user = userEvent.setup();
    setup();
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '/');
    expect(screen.getByRole('dialog', { name: /saved replies/i })).toBeInTheDocument();
  });
});
