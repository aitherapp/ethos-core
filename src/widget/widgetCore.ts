export interface WidgetConfig {
  ownerTicket: string;
  title: string;
  greeting: string;
  primaryColor: string;
  relayUrl?: string;
  relayToken?: string;
}

export interface WidgetInitPayload {
  type: 'ethos_widget_init';
  visitorId: string;
  page: string;
  referrer: string;
  message: string;
  timestamp: number;
}

export function generateVisitorId(): string {
  const bytes = new Uint8Array(2);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 256);
    bytes[1] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `Visitor #${hex}`;
}

export function parseWidgetConfig(data: Record<string, string | undefined>): WidgetConfig {
  if (!data.ownerTicket) {
    throw new Error('ETHOS Widget requires data-owner-ticket attribute.');
  }
  return {
    ownerTicket: data.ownerTicket,
    title: data.title || 'Chat with us',
    greeting: data.greeting || 'Hello! How can we help you today?',
    primaryColor: data.primaryColor || '#000000',
    relayUrl: data.relayUrl,
    relayToken: data.relayToken,
  };
}

export function createWidgetPayload(
  visitorId: string,
  page: string,
  referrer: string,
  message: string
): WidgetInitPayload {
  return {
    type: 'ethos_widget_init',
    visitorId,
    page,
    referrer,
    message,
    timestamp: Date.now(),
  };
}
