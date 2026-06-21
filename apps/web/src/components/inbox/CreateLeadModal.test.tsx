import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateLeadModal } from './CreateLeadModal';
import type { Conversation } from '@/lib/types/api';

// Stub toast so we can assert without a provider
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Stub the mutation hook — tests control resolved/rejected outcome via mockImplementation
const mockMutate = vi.fn();
vi.mock('@/lib/hooks/useCreateLeadFromConversation', () => ({
  useCreateLeadFromConversation: () => ({ mutate: mockMutate, isPending: false }),
}));

const baseConversation: Conversation = {
  id: 'conv-1',
  organizationId: 'org-1',
  igConversationId: '12345_67890',
  igAccountId: 'acc-1',
  igAccount: null,
  leadId: null,
  lead: null,
  assignedToId: null,
  assignedTo: null,
  status: 'OPEN',
  labels: [],
  firstResponseAt: null,
  lastInboundAt: null,
  lastMessageAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function setup(props: Partial<Parameters<typeof CreateLeadModal>[0]> = {}) {
  const onOpenChange = vi.fn();
  render(
    <CreateLeadModal
      conversation={baseConversation}
      open={true}
      onOpenChange={onOpenChange}
      {...props}
    />,
  );
  return { onOpenChange };
}

describe('CreateLeadModal', () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it('renders form fields when open', () => {
    setup();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter first name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter last name/i)).toBeInTheDocument();
  });

  it('pre-fills IG user ID from igConversationId', () => {
    setup();
    // igConversationId = '12345_67890', customer ID = parts.slice(1).join('_') = '67890'
    const readOnlyInput = screen.getAllByRole('textbox').find(
      (el) => (el as HTMLInputElement).readOnly,
    );
    expect(readOnlyInput).toHaveValue('67890');
  });

  it('Create Lead button is disabled when firstName is empty', () => {
    setup();
    expect(screen.getByRole('button', { name: /create lead/i })).toBeDisabled();
  });

  it('calls mutate with correct payload when firstName is provided', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText(/enter first name/i), 'Alice');
    await user.type(screen.getByPlaceholderText(/enter last name/i), 'Smith');
    await user.click(screen.getByRole('button', { name: /create lead/i }));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', firstName: 'Alice', lastName: 'Smith' }),
      expect.any(Object),
    );
  });

  it('does not include lastName in payload when left empty', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText(/enter first name/i), 'Bob');
    await user.click(screen.getByRole('button', { name: /create lead/i }));
    const [payload] = mockMutate.mock.calls[0] as [{ lastName?: string }];
    expect(payload).not.toHaveProperty('lastName');
  });

  it('renders nothing when open=false', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
