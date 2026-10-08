export type PaintPoint = { x: number; y: number };

export type Stroke = {
  color: 'black' | 'red' | 'eraser';
  points: PaintPoint[];
};

export type PaintEntry = Stroke | { clear: true };

type SessionStore = {
  entries: PaintEntry[];
  listeners: Set<() => void>;
};

const sessions = new Map<string, SessionStore>();
const EMPTY: readonly PaintEntry[] = Object.freeze([]);

function storeFor(sessionId: string): SessionStore {
  let store = sessions.get(sessionId);
  if (!store) {
    store = { entries: [], listeners: new Set() };
    sessions.set(sessionId, store);
  }
  return store;
}

function changed(store: SessionStore): void {
  for (const listener of store.listeners) listener();
}

export function getPaintSnapshot(sessionId: string): readonly PaintEntry[] {
  return sessions.get(sessionId)?.entries ?? EMPTY;
}

export function subscribePaint(sessionId: string, listener: () => void): () => void {
  const store = storeFor(sessionId);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function addPaintEntry(sessionId: string, entry: PaintEntry): void {
  const store = storeFor(sessionId);
  store.entries = [...store.entries, entry];
  changed(store);
}

export function undoPaintEntry(sessionId: string): void {
  const store = storeFor(sessionId);
  if (store.entries.length === 0) return;
  store.entries = store.entries.slice(0, -1);
  changed(store);
}

export function visibleStrokeCount(entries: readonly PaintEntry[]): number {
  let lastClear = -1;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if ('clear' in entries[index]) { lastClear = index; break; }
  }
  return entries.slice(lastClear + 1).filter((entry): entry is Stroke => !('clear' in entry)).length;
}
