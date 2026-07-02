export type MobilePanel = 'peers' | 'chat' | 'metrics';
export type MobileNavItemId = 'metrics' | 'about' | 'settings';

export type MobileNavItem = {
  id: MobileNavItemId;
  label: string;
};

export function getMobileNavItems(mobilePanel: MobilePanel): MobileNavItem[] {
  return [
    {
      id: 'metrics',
      label: mobilePanel === 'metrics' ? 'Hide Network / Metrics' : 'Network / Metrics',
    },
    { id: 'about', label: 'About' },
    { id: 'settings', label: 'Settings' },
  ];
}
