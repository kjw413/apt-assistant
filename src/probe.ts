// file:// 영속성 프로브: 원시 IndexedDB 카운터를 1씩 올리고 환경 정보를 보인다.
function openProbeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('apt-probe', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get('count');
    r.onsuccess = () => resolve(typeof r.result === 'number' ? r.result : 0);
    r.onerror = () => reject(r.error);
  });
}

function writeCount(db: IDBDatabase, n: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(n, 'count');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function runProbe(root: HTMLElement): Promise<void> {
  const db = await openProbeDb();
  const n = (await readCount(db)) + 1;
  await writeCount(db, n);
  db.close();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;

  const count = document.createElement('p');
  count.dataset.testid = 'probe-count';
  count.textContent = String(n);
  const info = document.createElement('p');
  info.dataset.testid = 'probe-info';
  info.textContent = `secure=${isSecureContext} locks=${'locks' in navigator} persisted=${persisted}`;
  root.replaceChildren(count, info);
}
