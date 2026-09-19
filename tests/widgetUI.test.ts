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

  it('should include branding footer with GitHub link', () => {
    const { shadowRoot } = createWidgetDOM({
      ownerTicket: 'ethos://node/test',
      title: 'Support Chat',
      greeting: 'Welcome!',
      primaryColor: '#000000',
    });

    const footer = shadowRoot.querySelector('.ethos-footer');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain('E T H O S by aitherapp');

    const link = footer?.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://github.com/aitherapp/ethos-core');
    expect(link?.getAttribute('target')).toBe('_blank');
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
