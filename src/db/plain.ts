import { toRaw } from 'vue'

/**
 * Deep-unwraps Vue reactive proxies so a record can cross the structured-clone
 * boundary into IndexedDB. Records read back out of a store's ref are deeply
 * reactive: spreading one copies the primitives by value, but a nested array
 * or object comes back through the proxy's get trap and stays a Proxy, which
 * structured clone rejects with DataCloneError.
 *
 * Every write that can carry a value read back out of a store ref goes through
 * here: all store write paths, plus setMeta(), which takes caller-supplied
 * `unknown`. The remaining direct Dexie writers (db/seed.ts, the syncItems puts
 * in services/sync/engine.ts, and the migration hooks above them) construct
 * their records literally and never touch a store ref, so they're already plain.
 * Anything new that persists a value a store could have handed it belongs here.
 */
export function toPlain<T> (value: T): T {
  const raw = toRaw(value)
  if (Array.isArray(raw)) {
    return raw.map(item => toPlain(item)) as T
  }
  if (!isPlainObject(raw)) {
    return raw
  }
  return Object.fromEntries(
    Object.entries(raw).map(([key, item]) => [key, toPlain(item)]),
  ) as T
}

// Anything else (Uint8Array, Date, …) structured-clones as-is and must not be
// rebuilt as a plain object.
function isPlainObject (value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
