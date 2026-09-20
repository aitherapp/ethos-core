import { describe, it, expect } from 'vitest';
import { parseWidgetConfig } from '../src/widget/widgetCore';

describe('widget relay attrs', () => {
  it('parses optional relay attrs', () => {
    const c = parseWidgetConfig({
      ownerTicket: 'ethos://node/abc',
      relayUrl: 'wss://r.example',
      relayToken: 'tok',
    });
    expect(c.relayUrl).toBe('wss://r.example');
    expect(c.relayToken).toBe('tok');
  });

  it('omits relay when absent', () => {
    const c = parseWidgetConfig({ ownerTicket: 'ethos://node/abc' });
    expect(c.relayUrl).toBeUndefined();
    expect(c.relayToken).toBeUndefined();
  });
});
