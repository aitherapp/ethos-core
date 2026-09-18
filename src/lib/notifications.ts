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

export async function sendLocalNotification(title: string, options?: NotificationOptions): Promise<Notification | null> {
  if (!isNotificationSupported()) return null;

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await requestNotificationPermission();
  }
  if (permission !== 'granted') return null;

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, {
        icon: './ethos-icon.svg',
        badge: './ethos-icon.svg',
        ...options,
      });
      return null;
    } else {
      return new Notification(title, options);
    }
  } catch (err) {
    console.warn('[Notification] Failed to trigger notification:', err);
    return null;
  }
}
