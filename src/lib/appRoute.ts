export function getAppLaunchHash() {
  return '#app';
}

export function shouldShowAppForHash(hash: string) {
  return hash.replace(/^#/, '') === 'app';
}
