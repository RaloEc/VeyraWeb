export interface DashboardQuickAccessItem {
  type: 'folder' | 'event';
  id: string;
}

export const QUICK_ACCESS_CHANGED_EVENT = 'veyra_dashboard_quick_access_changed';

export function getQuickAccessStorageKey(userId?: string): string {
  return `veyra_dashboard_quick_access_v1_${userId || 'default'}`;
}

export function loadDashboardQuickAccess(userId?: string): DashboardQuickAccessItem[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getQuickAccessStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (entry): entry is DashboardQuickAccessItem =>
        Boolean(
          entry &&
            typeof entry === 'object' &&
            ((entry as DashboardQuickAccessItem).type === 'folder' ||
              (entry as DashboardQuickAccessItem).type === 'event') &&
            typeof (entry as DashboardQuickAccessItem).id === 'string'
        )
    );
  } catch {
    return null;
  }
}

export function saveDashboardQuickAccess(
  userId: string | undefined,
  items: DashboardQuickAccessItem[] | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getQuickAccessStorageKey(userId);
    if (items === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(items));
    }
    window.dispatchEvent(
      new CustomEvent(QUICK_ACCESS_CHANGED_EVENT, { detail: { userId } })
    );
  } catch {
    // ignore storage errors
  }
}

export function isItemInDashboardQuickAccess(
  stored: DashboardQuickAccessItem[] | null,
  item: DashboardQuickAccessItem,
  fallbackRootFolderIds: string[]
): boolean {
  if (stored !== null) {
    return stored.some((entry) => entry.type === item.type && entry.id === item.id);
  }
  return item.type === 'folder' && fallbackRootFolderIds.includes(item.id);
}

export function toggleDashboardQuickAccessItem(
  userId: string | undefined,
  item: DashboardQuickAccessItem,
  fallbackRootFolderIds: string[]
): { added: boolean; items: DashboardQuickAccessItem[] } {
  const stored = loadDashboardQuickAccess(userId);
  const baseList: DashboardQuickAccessItem[] =
    stored !== null
      ? stored
      : fallbackRootFolderIds.map((id) => ({ type: 'folder', id }));

  const exists = baseList.some((entry) => entry.type === item.type && entry.id === item.id);
  const next = exists
    ? baseList.filter((entry) => !(entry.type === item.type && entry.id === item.id))
    : [...baseList, item];

  saveDashboardQuickAccess(userId, next);
  return { added: !exists, items: next };
}
