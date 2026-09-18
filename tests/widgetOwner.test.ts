import { describe, it, expect } from 'vitest';
import { parseWidgetMetadata, isWidgetContact, formatWidgetContactName } from '../src/lib/widgetOwner';

describe('Widget Owner Helper', () => {
  it('should identify and parse visitor metadata from message payload', () => {
    const rawPayload = JSON.stringify({
      type: 'ethos_widget_init',
      visitorId: 'Visitor #3d1a',
      page: '/pricing',
      referrer: 'google.com',
      message: 'What are your rates?',
    });

    const meta = parseWidgetMetadata(rawPayload);
    expect(meta).not.toBeNull();
    expect(meta?.visitorId).toBe('Visitor #3d1a');
    expect(meta?.page).toBe('/pricing');
    expect(meta?.referrer).toBe('google.com');
    expect(meta?.message).toBe('What are your rates?');
  });

  it('should return null for non-widget payloads', () => {
    expect(parseWidgetMetadata('hello world')).toBeNull();
    expect(parseWidgetMetadata(JSON.stringify({ type: 'normal_chat' }))).toBeNull();
  });

  it('should format visitor contact name with page context', () => {
    const name = formatWidgetContactName('Visitor #3d1a', '/pricing');
    expect(name).toBe('Visitor #3d1a (/pricing)');
  });

  it('should check if contact is a website visitor', () => {
    expect(isWidgetContact('Visitor #3d1a (/pricing)')).toBe(true);
    expect(isWidgetContact('Alice')).toBe(false);
  });
});
