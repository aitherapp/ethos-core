export function getAppLaunchHash() {
  return '#app';
}

export function shouldShowAppForHash(hash: string) {
  const value = hash.replace(/^#/, '');
  if (value === 'app') return true;
  // Notification deep links must mount the chat app, not the marketing landing page.
  if (value.startsWith('/chat/') || value.startsWith('chat/')) return true;
  return false;
}
