import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedReplyPicker } from './SavedReplyPicker';
import type { SavedReply } from '@/lib/types/api';

const makeReply = (overrides: Partial<SavedReply> = {}): SavedReply => ({
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
});

describe('SavedReplyPicker', () => {
  it('renders nothing when replies list is empty', () => {
    const { container } = render(
      <SavedReplyPicker replies={[]} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders search input and reply items', () => {
    render(
      <SavedReplyPicker
        replies={[makeReply()]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: /search/i })).toBeInTheDocument();
    expect(screen.getByText('Greeting')).toBeInTheDocument();
    expect(screen.getByText('/hi')).toBeInTheDocument();
  });

  it('filters replies by search term', async () => {
    const user = userEvent.setup();
    const replies = [
      makeReply({ id: 'sr-1', title: 'Greeting', content: 'Hello!' }),
      makeReply({ id: 'sr-2', title: 'Closing', content: 'Goodbye!', shortcut: '/bye' }),
    ];
    render(<SavedReplyPicker replies={replies} onSelect={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'Greeting');
    expect(screen.getByText('Greeting')).toBeInTheDocument();
    expect(screen.queryByText('Closing')).not.toBeInTheDocument();
  });

  it('shows "No replies match" when filter has no results', async () => {
    const user = userEvent.setup();
    render(
      <SavedReplyPicker
        replies={[makeReply()]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: /search/i }), 'zzznomatch');
    expect(screen.getByText(/no replies match/i)).toBeInTheDocument();
  });

  it('calls onSelect with reply content on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SavedReplyPicker
        replies={[makeReply({ content: 'Hello! How can I help you today?' })]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByText('Greeting'));
    expect(onSelect).toHaveBeenCalledWith('Hello! How can I help you today?');
  });

  it('calls onClose on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SavedReplyPicker replies={[makeReply()]} onSelect={vi.fn()} onClose={onClose} />,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSelect on Enter key with active item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SavedReplyPicker
        replies={[makeReply({ content: 'Hello!' })]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('Hello!');
  });
});
