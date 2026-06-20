import { describe, expect, it, vi } from 'vitest';

// Mock @socket.io/redis-emitter before importing the module under test.
const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ emit: mockEmit }));
const MockEmitter = vi.fn(() => ({ to: mockTo }));

vi.mock('@socket.io/redis-emitter', () => ({ Emitter: MockEmitter }));
vi.mock('ioredis', () => ({ default: vi.fn(() => ({})) }));

const { initNotificationPublisher, notifyOrg } = await import('./notification-publisher.js');

describe('notification-publisher', () => {
  it('throws if notifyOrg is called before initNotificationPublisher()', () => {
    // Fresh module state — emitter is null.
    expect(() => notifyOrg('org-1', 'test', {})).toThrow('not initialised');
  });

  it('publishes to the org room after initialisation', () => {
    initNotificationPublisher();
    notifyOrg('org-abc', 'message.received', { id: '123' });

    expect(mockTo).toHaveBeenCalledWith('org:org-abc');
    expect(mockEmit).toHaveBeenCalledWith('message.received', { id: '123' });
  });
});
