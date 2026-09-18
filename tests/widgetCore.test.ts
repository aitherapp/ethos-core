import { describe, it, expect } from 'vitest';
import { generateVisitorId, parseWidgetConfig, createWidgetPayload } from '../src/widget/widgetCore';

describe('Widget Core', () => {
  it('should generate consistent visitor ID format', () => {
    const id = generateVisitorId();
    expect(id).toMatch(/^Visitor #[a-f0-9]{4}$/);
  });

  it('should parse data attributes from script tag', () => {
    const config = parseWidgetConfig({
      ownerTicket: 'ethos://node/12345',
      title: 'Chat with us',
      greeting: 'Hi there!',
    });
    expect(config.ownerTicket).toBe('ethos://node/12345');
    expect(config.title).toBe('Chat with us');
    expect(config.greeting).toBe('Hi there!');
  });

  it('should throw error if ownerTicket is missing', () => {
    expect(() => parseWidgetConfig({})).toThrow();
  });

  it('should construct init message payload with page context', () => {
    const payload = createWidgetPayload('Visitor #1234', '/pricing', 'google.com', 'Hello!');
    expect(payload.type).toBe('ethos_widget_init');
    expect(payload.visitorId).toBe('Visitor #1234');
    expect(payload.page).toBe('/pricing');
    expect(payload.referrer).toBe('google.com');
    expect(payload.message).toBe('Hello!');
  });
});
