// Monotonic clock for last-write-wins `modifiedAt` stamps.
//
// Conflict resolution across devices is LWW by `modifiedAt` (see the sync
// engine). `Date.now()` alone is a poor source for that value: it can jump
// backwards (NTP correction, a manual clock change) and two writes in the same
// millisecond produce equal timestamps that the engine's `<=` comparison
// treats as "already applied". `nextModifiedAt()` clamps to a strictly
// increasing value per device so a burst of local edits keeps a stable order
// and a backwards clock step can't make a newer edit look older than the one
// it supersedes.
//
// This does NOT fix skew *between* devices — a device whose clock is set hours
// ahead still wins cross-device conflicts. That is an accepted tradeoff for an
// offline-first personal app; the monotonic clamp is the documented local
// mitigation. `observeModifiedAt` narrows the window further: by feeding it
// every timestamp minted elsewhere the device won't stamp its next edit behind
// a value it has already seen, which LWW would otherwise discard. `last` is
// per-session, so both feed paths matter: the pull path observes every remote
// revision (see engine.ts), and every store's hydrate re-observes its stored
// records (tombstones included) so a backwards clock step across a page reload
// can't mint an edit older than the record already on disk.

let last = 0

export function nextModifiedAt (): number {
  last = Math.max(Date.now(), last + 1)
  return last
}

export function observeModifiedAt (modifiedAt: number): void {
  if (Number.isFinite(modifiedAt) && modifiedAt > last) {
    last = modifiedAt
  }
}
