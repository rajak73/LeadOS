import { describe, it, expect, vi } from 'vitest';
import { eventBus } from './event-bus.js';
import { DomainEvent } from '@leados/shared';

describe('event bus', () => {
  it('delivers soft emits to subscribed handlers with an envelope', () => {
    const handler = vi.fn();
    eventBus.on(DomainEvent.LEAD_CREATED, handler);
    eventBus.emit(DomainEvent.LEAD_CREATED, { id: 'lead-1' });

    expect(handler).toHaveBeenCalledTimes(1);
    const envelope = handler.mock.calls[0]?.[0];
    expect(envelope).toMatchObject({
      event: DomainEvent.LEAD_CREATED,
      payload: { id: 'lead-1' },
    });
    expect(typeof envelope.emittedAt).toBe('string');
  });

  it('does not deliver to handlers of a different event', () => {
    const handler = vi.fn();
    eventBus.on(DomainEvent.DEAL_WON, handler);
    eventBus.emit(DomainEvent.LEAD_ASSIGNED, { id: 'x' });
    expect(handler).not.toHaveBeenCalled();
  });
});
