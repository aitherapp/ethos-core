export async function sendDirectWebPush(
  pushEndpoint: string | null,
  visitorId: string,
  pagePath: string,
  messageText: string,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  if (!pushEndpoint) return false;

  try {
    const payload = JSON.stringify({
      title: `New chat from ${visitorId}`,
      body: `[${pagePath}] ${messageText.slice(0, 100)}`,
    });

    const res = await fetchFn(pushEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TTL': '86400',
      },
      body: payload,
    });

    return res.ok || res.status === 201 || res.status === 202;
  } catch (err) {
    console.warn('[Widget Push] Direct push send failed:', err);
    return false;
  }
}
