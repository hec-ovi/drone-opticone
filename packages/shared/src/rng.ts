/**
 * Deterministic RNG (mulberry32). Purely functional: state in, state out.
 * The sim stores the state number inside MatchState so replays are exact.
 */
export function rngNext(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, state: a }
}

export function rngRange(state: number, min: number, max: number): { value: number; state: number } {
  const r = rngNext(state)
  return { value: min + r.value * (max - min), state: r.state }
}

/** FNV-1a over a stable JSON encoding. Used for determinism checks. */
export function stateHash(value: unknown): string {
  const json = JSON.stringify(value)
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
