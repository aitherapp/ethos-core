import { parseWidgetConfig, generateVisitorId } from './widgetCore';
import { createWidgetDOM } from './widgetUI';

(function initEthosWidget() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Find the executing script tag
  const scripts = document.querySelectorAll('script[data-owner-ticket]');
  const currentScript = scripts[scripts.length - 1] as HTMLScriptElement;

  if (!currentScript) {
    console.warn('[ETHOS Widget] Script tag missing data-owner-ticket attribute.');
    return;
  }

  try {
    const config = parseWidgetConfig({
      ownerTicket: currentScript.getAttribute('data-owner-ticket') || undefined,
      title: currentScript.getAttribute('data-title') || undefined,
      greeting: currentScript.getAttribute('data-greeting') || undefined,
      primaryColor: currentScript.getAttribute('data-color') || undefined,
    });

    const visitorId = localStorage.getItem('ethos_widget_visitor_id') || generateVisitorId();
    localStorage.setItem('ethos_widget_visitor_id', visitorId);

    const ui = createWidgetDOM(config);

    // Send button event handler
    const handleSend = () => {
      const text = ui.inputField.value.trim();
      if (!text) return;

      const msgEl = document.createElement('div');
      msgEl.className = 'ethos-msg visitor';
      msgEl.textContent = text;
      ui.messageLog.appendChild(msgEl);
      ui.messageLog.scrollTop = ui.messageLog.scrollHeight;

      ui.inputField.value = '';
    };

    ui.sendButton.addEventListener('click', handleSend);
    ui.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });

  } catch (err) {
    console.error('[ETHOS Widget]', err);
  }
})();
