'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Cross-tab and same-tab notification bus.
 *
 * `localStorage` only emits `storage` in *other* tabs, so same-tab writes
 * dispatch a local event to keep subscribers in step.
 */
const CHANGE_EVENT = 'quantprop:state-change';

function emitChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

/**
 * Snapshot cache.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is`, so returning a
 * freshly parsed object on every call would register as a change on every
 * render and loop forever. Keying the cache on the raw string keeps the
 * returned reference stable until the stored value actually differs.
 */
const snapshotCache = new Map<string, { raw: string | null; value: unknown }>();

function readStored<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Storage disabled; treat as empty rather than crashing.
    raw = null;
  }

  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  let value: unknown = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw);
    } catch {
      // Corrupt payload: fall back rather than crash.
      value = fallback;
    }
  }

  snapshotCache.set(key, { raw, value });
  return value as T;
}

function resolveInitial<T>(initialValue: T | (() => T)): T {
  return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
}

/**
 * State that survives a page refresh, without a setState-in-effect hydration
 * pass.
 *
 * `useSyncExternalStore` supplies the server snapshot during SSR and the stored
 * snapshot on the client, which is what keeps the first client render in
 * agreement with the server and avoids a hydration mismatch.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T)
): [T, (value: T | ((prev: T) => T)) => void] {
  // The server must never see localStorage, so it always renders the fallback.
  const getServerSnapshot = useCallback(() => resolveInitial(initialValue), [initialValue]);
  const getSnapshot = useCallback(() => readStored(key, resolveInitial(initialValue)), [key, initialValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = readStored(key, resolveInitial(initialValue));
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(current) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // Quota exceeded or storage disabled; the in-memory value still updates.
      }
      emitChange();
    },
    [key, initialValue]
  );

  return [value, set];
}

export function clearPersistedState(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do if storage is unavailable.
  }
  emitChange();
}