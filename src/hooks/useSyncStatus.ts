import { useState, useEffect } from 'react';
import { syncEngine, type SyncStatus } from '../lib/sync/syncEngine';

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(() => syncEngine.getStatus());
  const [pendingCount, setPendingCount] = useState<number>(() => syncEngine.getPendingCount());

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((newStatus, newPending) => {
      setStatus(newStatus);
      setPendingCount(newPending);
    });
    return unsubscribe;
  }, []);

  return {
    status,
    isOnline: status !== 'offline',
    isSyncing: status === 'syncing',
    pendingCount,
    flush: () => syncEngine.processOutbox(),
  };
}

