import { localDB } from './db/local-db';

/**
 * Limpieza completa de datos locales del usuario al cerrar sesión o revocar dispositivo.
 */
export async function clearAllWebLocalData(): Promise<void> {
  try {
    await localDB.delete();
  } catch {
    // ignore localDB delete error
  }

  if (typeof window === 'undefined') return;

  if (typeof indexedDB !== 'undefined') {
    try {
      const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
      for (const dbInfo of dbs) {
        if (dbInfo.name && dbInfo.name.startsWith('veyra-yjs-')) {
          await new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(dbInfo.name!);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          });
        }
      }
    } catch {
      // ignore indexedDB enumeration errors
    }
  }

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore storage clear errors
  }
}
