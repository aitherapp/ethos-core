export interface WidgetMetadata {
  type: 'ethos_widget_init';
  visitorId: string;
  page: string;
  referrer?: string;
  message: string;
}

export function parseWidgetMetadata(rawContent: string): WidgetMetadata | null {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === 'object' && parsed.type === 'ethos_widget_init' && parsed.visitorId) {
      return parsed as WidgetMetadata;
    }
  } catch {}
  return null;
}

export function formatWidgetContactName(visitorId: string, page: string): string {
  return `${visitorId} (${page})`;
}

export function isWidgetContact(contactName: string): boolean {
  return contactName.startsWith('Visitor #');
}
