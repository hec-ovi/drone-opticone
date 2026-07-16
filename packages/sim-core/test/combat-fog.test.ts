import { describe, expect, it } from 'vitest'
import { createMatch, makeDrone, snapshot, tick, TUNING } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'
import type { MatchState } from '@opticone/shared'

const P = ['alpha', 'beta'] as [string, string]

function calm(): MatchState {
  return createMatch(21, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
}

describe('C-03 combat', () => {
  it('two Shahed-class kamikazes destroy the enemy centcomm and end the match', () => {
    let s = calm()
    const base = s.structures.find((st) => st.playerId === 'beta' && st.kind === 'centcomm')!
    const spec = getDrone('shahed136')!
    s.drones.push(makeDrone(spec, 'alpha', { x: base.pos.x - 300, y: 600, z: base.pos.z }, 'sh-1'))
    s.drones.push(makeDrone(spec, 'alpha', { x: base.pos.x, y: 600, z: base.pos.z - 300 }, 'sh-2'))

    // The Shahed has controlRangeM 0: it only accepts standing-policy orders.
    let result = tick(s, [
      { type: 'attack', playerId: 'alpha', droneIds: ['sh-1', 'sh-2'], targetId: base.id, origin: 'policy' },
    ])
    s = result.state
    const allEvents = [...result.events]
    for (let t = 0; t < 30 * 20 && !s.winner; t++) {
      result = tick(s, [])
      s = result.state
      allEvents.push(...result.events)
    }

    expect(s.winner).toBe('alpha')
    expect(allEvents.some((e) => e.type === 'matchEnded' && e.winner === 'alpha')).toBe(true)
    expect(s.structures.some((st) => st.id === base.id)).toBe(false)
    // Kamikazes die in their own blast.
    expect(s.drones.some((d) => d.id === 'sh-1' || d.id === 'sh-2')).toBe(false)
  })

  it('an FPV warhead hurts but does not one-shot a structure', () => {
    let s = calm()
    const factory = s.structures.find((st) => st.playerId === 'beta' && st.kind === 'factory')!
    const spec = getDrone('fpv-strike')!
    s.drones.push(makeDrone(spec, 'alpha', { x: factory.pos.x - 50, y: 60, z: factory.pos.z }, 'fpv-1'))
    s = tick(s, [{ type: 'attack', playerId: 'alpha', droneIds: ['fpv-1'], targetId: factory.id, origin: 'policy' }]).state
    for (let t = 0; t < 10 * 20; t++) s = tick(s, []).state
    const after = s.structures.find((st) => st.id === factory.id)!
    expect(after.hp).toBeLessThan(TUNING.structureHp.factory)
    expect(after.hp).toBeGreaterThan(0)
  })

  it('two drones in the same airspace collide and both are destroyed', () => {
    let s = calm()
    const spec = getDrone('mavic3')!
    s.drones.push(makeDrone(spec, 'alpha', { x: 2000, y: 60, z: 2000 }, 'col-a'))
    s.drones.push(makeDrone(spec, 'beta', { x: 2001, y: 60, z: 2000 }, 'col-b'))
    const r = tick(s, [])
    expect(r.state.drones.some((d) => d.id === 'col-a' || d.id === 'col-b')).toBe(false)
    expect(r.events.some((e) => e.type === 'collided' && e.aId === 'col-a' && e.bId === 'col-b')).toBe(true)
  })
})

describe('C-03 fog of war and satellite', () => {
  it('the enemy base is hidden until a satellite sweep reveals it', () => {
    let s = calm()
    s = tick(s, []).state
    const before = snapshot(s, 'alpha')
    expect(before.enemyDrones.length).toBe(0)
    expect(before.structures.every((st) => st.playerId === 'alpha')).toBe(true)

    const betaBase = { x: s.mapSizeM - 500, z: s.mapSizeM - 500 }
    const energy0 = s.players[0]!.satellite.energy
    s = tick(s, [{ type: 'satelliteSweep', playerId: 'alpha', center: betaBase }]).state
    const after = snapshot(s, 'alpha')
    expect(s.players[0]!.satellite.energy).toBeLessThan(energy0)
    expect(after.structures.some((st) => st.playerId === 'beta')).toBe(true)
    expect(after.enemyDrones.length).toBeGreaterThan(0)

    // Sweeps expire; the area stays explored but enemy DRONES go dark again.
    for (let t = 0; t < TUNING.satellite.sweepDurationS * 20 + 5; t++) s = tick(s, []).state
    const later = snapshot(s, 'alpha')
    expect(later.enemyDrones.length).toBe(0)
    expect(later.structures.some((st) => st.playerId === 'beta')).toBe(true)
  })

  it('snapshot never leaks the other player economy or unexplored nodes', () => {
    const s = tick(calm(), []).state
    const view = snapshot(s, 'alpha')
    expect(view.economy).toEqual(s.players[0]!.economy)
    // Mid-map seeded nodes are unexplored at match start.
    expect(view.nodes.length).toBeLessThan(s.nodes.length)
    expect(view.playerId).toBe('alpha')
  })
})
