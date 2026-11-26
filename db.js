// Data layer: a thin promise wrapper around IndexedDB.
// All user data stays in the browser on the user's device.
const DB_NAME = 'atl';
const DB_VERSION = 1;
export const STORES = ['tasks', 'projects', 'settings'];
let dbPromise;

export function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        STORES.forEach((s) => {
          if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const remove = (store, id) => run(store, 'readwrite', (s) => s.delete(id));

// Replace everything in one atomic transaction: if anything fails, old data stays untouched.
export async function replaceAll(data) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const names = Object.keys(data);
    const tx = db.transaction(names, 'readwrite');
    names.forEach((n) => {
      const s = tx.objectStore(n);
      s.clear();
      data[n].forEach((item) => s.put(item));
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
