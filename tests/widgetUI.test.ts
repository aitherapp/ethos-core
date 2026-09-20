// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { createWidgetDOM } from '../src/widget/widgetUI';

describe('Widget UI DOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should inject shadow root container to isolate styles', () => {
    const { container, shadowRoot, toggleButton, chatWindow } = createWidgetDOM({
      ownerTicket: 'ethos://node/test',
      title: 'Support Chat',
      greeting: 'Welcome!',
      primaryColor: '#000000',
    });

    expect(document.body.contains(container)).toBe(true);
    expect(shadowRoot).not.toBeNull();
    expect(shadowRoot.querySelector('.ethos-launcher')).not.toBeNull();
    expect(shadowRoot.querySelector('.ethos-chat-window')).not.toBeNull();
  });

  it('should include branding footer with version and GitHub link', () => {
    const { shadowRoot } = createWidgetDOM({
      ownerTicket: 'ethos://node/test',
      title: 'Support Chat',
      greeting: 'Welcome!',
      primaryColor: '#000000',
    });

    const footer = shadowRoot.querySelector('.ethos-footer');
    expect(footer?.textContent).toContain('ETHOS widget v');
    expect(footer?.textContent).toMatch(/v\d+\.\d+\.\d+/);
    expect(footer?.querySelector('a')?.getAttribute('href')).toBe(
      'https://github.com/aitherapp/ethos-core'
    );
  });

  it('should update header connection status via setConnectionStatus', () => {
    const { shadowRoot, setConnectionStatus } = createWidgetDOM({
      ownerTicket: 'ethos://node/test',
      title: 'Support Chat',
      greeting: 'Welcome!',
      primaryColor: '#000000',
    });

    const subtitle = shadowRoot.querySelector('.ethos-header-subtitle');
    const dot = shadowRoot.querySelector('.ethos-online-dot');
    expect(subtitle?.textContent).toContain('Connecting');

    setConnectionStatus('relay');
    expect(subtitle?.textContent).toContain('Relay');
    expect(dot?.className).toContain('ethos-online-dot--relay');

    setConnectionStatus('offline');
    expect(subtitle?.textContent).toContain('Offline');
    expect(dot?.className).toContain('ethos-online-dot--offline');
  });

  it('should toggle chat window visibility on button click', () => {
    const { shadowRoot, toggleButton, chatWindow } = createWidgetDOM({
      ownerTicket: 'ethos://node/test',
      title: 'Support Chat',
      greeting: 'Welcome!',
      primaryColor: '#000000',
    });

    expect(chatWindow.classList.contains('open')).toBe(false);
    toggleButton.click();
    expect(chatWindow.classList.contains('open')).toBe(true);
    toggleButton.click();
    expect(chatWindow.classList.contains('open')).toBe(false);
  });
});
