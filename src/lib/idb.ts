import type { AppData } from '@/types';
import { getOrCreateDeviceId } from '@/lib/relay';

const DB_NAME = 'cairn-db';
const DB_VERSION = 1;
const STORE_NAME = 'appdata';
const DATA_KEY = 'state';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadData(): Promise<AppData | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(DATA_KEY);
      req.onsuccess = () => {
        const data = req.result ?? null;
        if (data) {
          if (!data.importedChangeIds) data.importedChangeIds = [];
          if (!data.deviceId) data.deviceId = getOrCreateDeviceId();
          if (!data.conflicts) data.conflicts = [];
          if (!data.resolvedConflictIds) data.resolvedConflictIds = [];
        }
        resolve(data);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, DATA_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silent fail — best-effort persistence
  }
}
