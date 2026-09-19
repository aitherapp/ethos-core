export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return await Notification.requestPermission();
}

export function formatVisitorNotification(visitorId: string, pagePath: string, messagePreview: string) {
  return {
    title: `New chat from ${visitorId}`,
    body: `[${pagePath}] ${messagePreview.slice(0, 100)}`,
  };
}

export type LocalNotificationResult =
  | { ok: true; via: 'service-worker' | 'notification-api' }
  | { ok: false; reason: 'unsupported' | 'denied' | 'failed'; detail?: string };

function absoluteAssetUrl(relativePath: string): string {
  try {
    return new URL(relativePath, window.location.href).href;
  } catch {
    return relativePath;
  }
}

/**
 * Show a local OS notification (not via the push gateway).
 * Prefers the service worker path (required for reliable delivery on Chrome),
 * falls back to the page Notification API. Awaits showNotification so failures surface.
 */
export async function sendLocalNotification(
  title: string,
  options?: NotificationOptions,
): Promise<LocalNotificationResult> {
  if (!isNotificationSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await requestNotificationPermission();
  }
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied', detail: permission };
  }

  const icon = absoluteAssetUrl('./ethos-icon.svg');
  const merged: NotificationOptions = {
    icon,
    badge: icon,
    ...options,
  };

  // Chrome on macOS: await SW showNotification; relative icon URLs often fail silently.
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, merged);
      return { ok: true, via: 'service-worker' };
    } catch (err) {
      console.warn('[Notification] Service worker showNotification failed, falling back:', err);
    }
  }

  try {
    // Fallback when SW is missing or showNotification failed
    // eslint-disable-next-line no-new
    new Notification(title, merged);
    return { ok: true, via: 'notification-api' };
  } catch (err) {
    console.warn('[Notification] Failed to trigger notification:', err);
    return {
      ok: false,
      reason: 'failed',
      detail: err instanceof Error ? err.message : 'unknown',
    };
  }
}
