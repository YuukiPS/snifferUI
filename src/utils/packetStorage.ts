import type { Packet } from '../types';

const DB_NAME = 'packet_monitor_db';
const DB_VERSION = 1;
const STORE_NAME = 'packets';

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'index' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Save a batch of packets to IndexedDB.
 */
export async function savePackets(packets: Packet[]): Promise<void> {
  if (packets.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const packet of packets) {
    store.put(packet);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save a single packet to IndexedDB.
 */
export async function savePacket(packet: Packet): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(packet);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load all packets from IndexedDB, sorted by index.
 */
export async function loadAllPackets(): Promise<Packet[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const packets = request.result as Packet[];
      // Sort by index to maintain order
      packets.sort((a, b) => a.index - b.index);
      resolve(packets);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all packets from IndexedDB.
 */
export async function clearAllPackets(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get the count of stored packets.
 */
export async function getPacketCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.count();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get browser storage estimate (usage and quota in bytes).
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return { usage: 0, quota: 0 };
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// --- Write buffer for batching saves during high-frequency streaming ---

let writeBuffer: Packet[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushCallback: (() => void) | null = null;

/**
 * Queue a packet for batched writing to IndexedDB.
 * Flushes every 500ms or when buffer reaches 50 packets.
 */
export function queuePacketSave(packet: Packet, onFlushed?: () => void): void {
  writeBuffer.push(packet);
  if (onFlushed) flushCallback = onFlushed;

  if (writeBuffer.length >= 50) {
    flushWriteBuffer();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => flushWriteBuffer(), 500);
  }
}

/**
 * Immediately flush the write buffer to IndexedDB.
 */
export async function flushWriteBuffer(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (writeBuffer.length === 0) return;

  const batch = writeBuffer.splice(0);
  try {
    await savePackets(batch);
    if (flushCallback) flushCallback();
  } catch (err) {
    console.error('Failed to flush packet write buffer:', err);
  }
}
