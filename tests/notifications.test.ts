import { describe, it, expect, vi } from 'vitest';
import { isNotificationSupported, formatVisitorNotification } from '../src/lib/notifications';

describe('Notifications Helper', () => {
  it('should format visitor notification title and body', () => {
    const formatted = formatVisitorNotification('Visitor #4f2a', '/pricing', 'Hello!');
    expect(formatted.title).toBe('New chat from Visitor #4f2a');
    expect(formatted.body).toContain('/pricing');
    expect(formatted.body).toContain('Hello!');
  });

  it('should check if notifications are supported', () => {
    const supported = isNotificationSupported();
    expect(typeof supported).toBe('boolean');
  });
});
