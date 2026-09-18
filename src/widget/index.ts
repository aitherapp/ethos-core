import { iroh } from '../lib/iroh';
import { parseWidgetConfig, generateVisitorId, createWidgetPayload } from './widgetCore';
import { createWidgetDOM } from './widgetUI';
import { sendDirectWebPush } from './pushTrigger';
import { SecureMessage } from '../types';

(async function initEthosWidget() {
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

    // Initialize iroh for visitor node
    await iroh.initialize(visitorId);
    
    // Connect to site owner's ETHOS ticket
    const ownerTicket = config.ownerTicket;
    const ownerPeerId = ownerTicket.replace('ethos://node/', '').slice(0, 8);
    await iroh.connectByTicket(ownerTicket);

    let isInitialMessage = true;

    // Listen for replies from site owner
    iroh.onMessage((msg: SecureMessage) => {
      if (msg.senderId.includes(ownerPeerId) || ownerTicket.includes(msg.senderId) || msg.senderId === ownerTicket) {
        const replyText = msg.content;
        if (replyText) {
          const msgEl = document.createElement('div');
          msgEl.className = 'ethos-msg owner';
          msgEl.textContent = replyText;
          ui.messageLog.appendChild(msgEl);
          ui.messageLog.scrollTop = ui.messageLog.scrollHeight;
        }
      }
    });

    // Send button event handler
    const handleSend = async () => {
      const text = ui.inputField.value.trim();
      if (!text) return;

      // Render locally
      const msgEl = document.createElement('div');
      msgEl.className = 'ethos-msg visitor';
      msgEl.textContent = text;
      ui.messageLog.appendChild(msgEl);
      ui.messageLog.scrollTop = ui.messageLog.scrollHeight;

      ui.inputField.value = '';

      // Send Web Push notification if endpoint is available
      const pushEndpoint = currentScript.getAttribute('data-push-endpoint') || iroh.getPushEndpoint(ownerTicket) || iroh.getPushEndpoint(ownerPeerId);
      sendDirectWebPush(pushEndpoint, visitorId, window.location.pathname || '/', text).catch(() => {});

      if (isInitialMessage) {
        const payload = createWidgetPayload(
          visitorId,
          window.location.pathname || '/',
          document.referrer || '',
          text
        );
        await iroh.sendMessage(ownerTicket, JSON.stringify(payload));
        isInitialMessage = false;
      } else {
        await iroh.sendMessage(ownerTicket, text);
      }
    };

    ui.sendButton.addEventListener('click', handleSend);
    ui.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });

  } catch (err) {
    console.error('[ETHOS Widget]', err);
  }
})();
