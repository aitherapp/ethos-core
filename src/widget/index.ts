import { iroh } from '../lib/iroh';
import { parseWidgetConfig, generateVisitorId, createWidgetPayload } from './widgetCore';
import { createWidgetDOM } from './widgetUI';
import { notifyPeerViaGateway, type NotifyPushProfile } from '../lib/peerPush';
import { SecureMessage } from '../types';
import type { PushContentMode, PushTriggerMode } from '../lib/pushSettings';
import { mapTransportModeToWidgetStatus } from './connectionStatus';

function resolveOwnerPushProfile(
  script: HTMLScriptElement,
  ownerTicket: string,
  ownerPeerId: string
): NotifyPushProfile | null {
  const handshake =
    iroh.getPeerPushProfile(ownerTicket) ||
    iroh.getPeerPushProfile(ownerPeerId);

  const attrGateway = script.getAttribute('data-push-gateway-url');
  const attrToken = script.getAttribute('data-push-auth-token');

  if (handshake?.pushGatewayUrl && handshake.pushAuthToken && handshake.pushSubscription) {
    return handshake;
  }

  // Optional English-documented bootstrap for first-message races before handshake profile arrives.
  const pushGatewayUrl = handshake?.pushGatewayUrl || attrGateway;
  const pushAuthToken = handshake?.pushAuthToken || attrToken;
  const pushSubscription = handshake?.pushSubscription ?? null;
  if (!pushGatewayUrl || !pushAuthToken || !pushSubscription) {
    return null;
  }

  return {
    pushGatewayUrl,
    pushAuthToken,
    pushSubscription,
    pushContentMode: (handshake?.pushContentMode ?? 'Sender') as PushContentMode,
    pushTriggerMode: (handshake?.pushTriggerMode ?? 'Background only') as PushTriggerMode,
  };
}

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

    const refreshOwnerStatus = () => {
      const transport =
        iroh.getPeerTransportStatus(ownerTicket) ||
        iroh.getPeerTransportStatus(ownerPeerId);
      const mode = transport?.mode ?? 'connecting';
      ui.setConnectionStatus(mapTransportModeToWidgetStatus(mode));
    };

    refreshOwnerStatus();
    const statusTimer = window.setInterval(refreshOwnerStatus, 1000);
    window.addEventListener('pagehide', () => window.clearInterval(statusTimer), { once: true });

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

      const notifyOwner = (messageId: string) => {
        const ownerProfile = resolveOwnerPushProfile(currentScript, ownerTicket, ownerPeerId);
        // Widget → site-owner is inherently a wake-up path. Do not trust zombie
        // direct/relay flags on a backgrounded phone to suppress the gateway push.
        return notifyPeerViaGateway(ownerProfile, {
          senderName: visitorId,
          previewText: text,
          localPeerId: iroh.getIdentity()?.id || visitorId,
          messageId,
          directConnected: false,
          relayConnected: false,
        }).catch(() => false);
      };

      let sent: Awaited<ReturnType<typeof iroh.sendMessage>> = null;
      if (isInitialMessage) {
        const payload = createWidgetPayload(
          visitorId,
          window.location.pathname || '/',
          document.referrer || '',
          text
        );
        // skipPush: widget owns the wake-up notify so Background-only + stale
        // transport flags cannot drop the only path that reaches a backgrounded iPhone.
        sent = await iroh.sendMessage(ownerTicket, JSON.stringify(payload), { skipPush: true });
        isInitialMessage = false;
      } else {
        sent = await iroh.sendMessage(ownerTicket, text, { skipPush: true });
      }

      await notifyOwner(sent?.id ?? `widget-${Date.now()}`);
    };

    ui.sendButton.addEventListener('click', handleSend);
    ui.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });

  } catch (err) {
    console.error('[ETHOS Widget]', err);
  }
})();
