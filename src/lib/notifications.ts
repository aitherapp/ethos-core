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

export function sendLocalNotification(title: string, options?: NotificationOptions): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return null;
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        icon: './ethos-icon.svg',
        badge: './ethos-icon.svg',
        ...options,
      });
    });
    return null;
  } else {
    return new Notification(title, options);
  }
}
