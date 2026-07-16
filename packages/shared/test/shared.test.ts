import { describe, expect, it } from 'vitest'
import { Bus, rngNext, rngRange, stateHash } from '@opticone/shared'

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a1 = rngNext(42)
    const a2 = rngNext(42)
    expect(a1).toEqual(a2)
    expect(a1.value).toBeGreaterThanOrEqual(0)
    expect(a1.value).toBeLessThan(1)
  })

  it('advances state and produces different values', () => {
    let s = 7
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const r = rngNext(s)
      s = r.state
      seen.add(r.value)
    }
    expect(seen.size).toBeGreaterThan(990)
  })

  it('rngRange stays in bounds', () => {
    let s = 1
    for (let i = 0; i < 100; i++) {
      const r = rngRange(s, 5, 10)
      s = r.state
      expect(r.value).toBeGreaterThanOrEqual(5)
      expect(r.value).toBeLessThan(10)
    }
  })
})

describe('stateHash', () => {
  it('same value same hash, different value different hash', () => {
    expect(stateHash({ a: 1, b: [2, 3] })).toBe(stateHash({ a: 1, b: [2, 3] }))
    expect(stateHash({ a: 1 })).not.toBe(stateHash({ a: 2 }))
  })
})

describe('bus', () => {
  it('delivers to subscribers and honors unsubscribe', () => {
    const bus = new Bus<{ ping: number }>()
    const got: number[] = []
    const off = bus.on('ping', (n) => got.push(n))
    bus.emit('ping', 1)
    off()
    bus.emit('ping', 2)
    expect(got).toEqual([1])
  })
})
