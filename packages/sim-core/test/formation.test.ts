import { describe, expect, it } from 'vitest'
import { createMatch, makeDrone, tick } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'
import type { MatchState } from '@opticone/shared'

const P = ['alpha', 'beta'] as [string, string]

function calm(): MatchState {
  return createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
}

describe('C-03 spacing and collisions', () => {
  it('own drones at the same point push apart instead of destroying each other', () => {
    let s = calm()
    const spec = getDrone('fpv-strike')!
    s.drones.push(makeDrone(spec, 'alpha', { x: 2000, y: 60, z: 2000 }, 'a1'))
    s.drones.push(makeDrone(spec, 'alpha', { x: 2001, y: 60, z: 2000 }, 'a2'))
    for (let t = 0; t < 20; t++) s = tick(s, []).state
    const a1 = s.drones.find((d) => d.id === 'a1')!
    const a2 = s.drones.find((d) => d.id === 'a2')!
    expect(a1).toBeDefined()
    expect(a2).toBeDefined()
    expect(Math.hypot(a1.pos.x - a2.pos.x, a1.pos.z - a2.pos.z)).toBeGreaterThan(4)
  })

  it('enemy drones meeting mid-air still destroy each other', () => {
    let s = calm()
    const spec = getDrone('fpv-strike')!
    s.drones.push(makeDrone(spec, 'alpha', { x: 2000, y: 60, z: 2000 }, 'a1'))
    s.drones.push(makeDrone(spec, 'beta', { x: 2001, y: 60, z: 2000 }, 'b1'))
    const r = tick(s, [])
    expect(r.state.drones.find((d) => d.id === 'a1')).toBeUndefined()
    expect(r.state.drones.find((d) => d.id === 'b1')).toBeUndefined()
    expect(r.events.some((e) => e.type === 'collided')).toBe(true)
  })

  it('a group move order fans destinations out over a disc', () => {
    let s = calm()
    const spec = getDrone('fpv-strike')!
    s.drones.push(makeDrone(spec, 'alpha', { x: 900, y: 60, z: 900 }, 'g1'))
    s.drones.push(makeDrone(spec, 'alpha', { x: 950, y: 60, z: 900 }, 'g2'))
    s.drones.push(makeDrone(spec, 'alpha', { x: 1000, y: 60, z: 900 }, 'g3'))
    s = tick(s, [
      { type: 'move', playerId: 'alpha', droneIds: ['g1', 'g2', 'g3'], to: { x: 2000, y: 0, z: 2000 } },
    ]).state
    const dests = s.drones
      .filter((d) => ['g1', 'g2', 'g3'].includes(d.id))
      .map((d) => d.dest!)
    // All near the click point, but no two identical.
    for (const dest of dests) {
      expect(Math.hypot(dest.x - 2000, dest.z - 2000)).toBeLessThan(80)
    }
    expect(new Set(dests.map((d) => `${d.x.toFixed(2)},${d.z.toFixed(2)}`)).size).toBe(3)
  })

  it('consecutive factory builds spawn on a ring, never stacked', () => {
    let s = calm()
    const factory = s.structures.find((st) => st.playerId === 'alpha' && st.kind === 'factory')!
    s.players.find((p) => p.id === 'alpha')!.economy.credits = 99999
    s.players.find((p) => p.id === 'alpha')!.economy.lithiumKg = 999
    s.players.find((p) => p.id === 'alpha')!.economy.plasticKg = 999
    s = tick(s, [
      { type: 'build', playerId: 'alpha', structureId: factory.id, specId: 'fpv-strike' },
      { type: 'build', playerId: 'alpha', structureId: factory.id, specId: 'fpv-strike' },
    ]).state
    const before = s.drones.length
    for (let t = 0; t < 6 * 20; t++) s = tick(s, []).state
    const spawned = s.drones.slice(before)
    expect(spawned.length).toBe(2)
    const [s1, s2] = spawned
    expect(Math.hypot(s1!.pos.x - s2!.pos.x, s1!.pos.z - s2!.pos.z)).toBeGreaterThan(10)
  })
})
