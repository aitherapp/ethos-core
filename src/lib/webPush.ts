export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  try {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch {
    return new Uint8Array(new TextEncoder().encode(base64String));
  }
}

export function formatPushPayload(visitorId: string, pagePath: string, messagePreview: string) {
  return {
    title: `New chat from ${visitorId}`,
    body: `[${pagePath}] ${messagePreview.slice(0, 100)}`,
    icon: './ethos-icon.svg',
    badge: './ethos-icon.svg',
    data: { url: './' },
  };
}

function encodeUrlSafeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateVapidPublicKeyFromEntropy(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random entropy is required to generate a VAPID public key');
  }
  const bytes = new Uint8Array(65);
  crypto.getRandomValues(bytes);
  return encodeUrlSafeBase64(bytes);
}

export async function getOrCreateVapidPublicKey(): Promise<string> {
  if (typeof localStorage === 'undefined') {
    return 'demo_vapid_key_for_node_env';
  }
  let key = localStorage.getItem('ethos_vapid_public_key');
  if (!key) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const keyPair = await crypto.subtle.generateKey(
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign', 'verify']
        );
        const exported = await crypto.subtle.exportKey('raw', keyPair.publicKey);
        key = encodeUrlSafeBase64(new Uint8Array(exported));
      } catch {
        key = generateVapidPublicKeyFromEntropy();
      }
    } else {
      key = generateVapidPublicKeyFromEntropy();
    }
    localStorage.setItem('ethos_vapid_public_key', key);
  }
  return key;
}

export async function subscribeToWebPush(publicKeyBase64: string): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const applicationServerKey = urlBase64ToUint8Array(publicKeyBase64);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }
    return subscription;
  } catch (err) {
    console.warn('[WebPush] Subscription failed:', err);
    return null;
  }
}
