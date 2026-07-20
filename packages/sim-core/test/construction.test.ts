import { describe, expect, it } from 'vitest'
import { createMatch, snapshot, tick } from '@opticone/sim-core'
import { getCatalog } from '@opticone/registry'
import {
  STRUCTURE_BUILD,
  canPlaceStructure,
  powerStatus,
  type MatchState,
  type SimEvent,
} from '@opticone/shared'

const P = ['alpha', 'beta'] as [string, string]

function calm(): MatchState {
  return createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
}

// A clear site near the alpha base at (500, 500): outside every building and
// node footprint, inside the 600 m base-creep radius.
const SITE = { x: 860, z: 860 }

describe('C-03 construction', () => {
  it('canPlaceStructure enforces edge, spacing, node clearance and base range', () => {
    const field = {
      mapSizeM: 4000,
      structures: [{ pos: { x: 500, z: 500 }, playerId: 'a' }],
      nodes: [{ pos: { x: 700, z: 500 } }],
    }
    expect(canPlaceStructure(field, 'a', 30, 500)).toBe(false) // map edge
    expect(canPlaceStructure(field, 'a', 560, 500)).toBe(false) // overlaps a structure
    expect(canPlaceStructure(field, 'a', 700, 540)).toBe(false) // overlaps a node
    expect(canPlaceStructure(field, 'a', 2000, 2000)).toBe(false) // too far from any own structure
    expect(canPlaceStructure(field, 'a', 800, 800)).toBe(true)
    expect(canPlaceStructure(field, 'b', 800, 800)).toBe(false) // near enemy, not near own
  })

  it('construct pays the bill, rises inactive, then powers on with full hull', () => {
    let s = calm()
    const build = STRUCTURE_BUILD['power-plant']!
    const eco0 = { ...s.players[0]!.economy }
    s = tick(s, [{ type: 'construct', playerId: 'alpha', kind: 'power-plant', at: SITE }]).state

    const site = s.structures.find(
      (st) => st.playerId === 'alpha' && st.kind === 'power-plant' && st.id !== 's-alpha-power',
    )!
    expect(site).toBeDefined()
    expect(site.readyAtTick).toBeGreaterThan(s.tick)
    expect(site.hp).toBeLessThan(site.hpMax / 2)
    expect(s.players[0]!.economy.lithiumKg).toBeCloseTo(eco0.lithiumKg - build.lithiumKg)
    expect(s.players[0]!.economy.plasticKg).toBeCloseTo(eco0.plasticKg - build.plasticKg)
    expect(s.players[0]!.economy.credits).toBeCloseTo(eco0.credits - build.credits)

    // Under construction it adds nothing to the grid.
    const cap0 = powerStatus(s.structures, 'alpha', s.tick).cap
    const events: SimEvent[] = []
    for (let t = 0; t < build.timeS * 20 + 2; t++) {
      const r = tick(s, [])
      s = r.state
      events.push(...r.events)
    }
    const done = s.structures.find((st) => st.id === site.id)!
    expect(done.readyAtTick).toBeUndefined()
    expect(done.hp).toBeGreaterThan(done.hpMax * 0.95)
    expect(powerStatus(s.structures, 'alpha', s.tick).cap).toBe(cap0 + 60)
    expect(
      events.some((e) => e.type === 'spawned' && e.entityId === site.id && e.specId === 'power-plant'),
    ).toBe(true)
  })

  it('rejects blocked sites, empty banks and unbuildable kinds', () => {
    const s0 = calm()
    const count = s0.structures.length
    const eco0 = { ...s0.players[0]!.economy }

    // On top of the centcomm.
    let s = tick(s0, [{ type: 'construct', playerId: 'alpha', kind: 'relay', at: { x: 520, z: 500 } }]).state
    expect(s.structures.length).toBe(count)
    // Far from every own structure.
    s = tick(s0, [{ type: 'construct', playerId: 'alpha', kind: 'relay', at: { x: 2000, z: 500 } }]).state
    expect(s.structures.length).toBe(count)
    // The centcomm itself is never buildable.
    s = tick(s0, [{ type: 'construct', playerId: 'alpha', kind: 'centcomm', at: SITE }]).state
    expect(s.structures.length).toBe(count)
    // Broke.
    const poor = calm()
    poor.players[0]!.economy.credits = 0
    s = tick(poor, [{ type: 'construct', playerId: 'alpha', kind: 'relay', at: SITE }]).state
    expect(s.structures.length).toBe(count)
    expect(s.players[0]!.economy.lithiumKg).toBeCloseTo(eco0.lithiumKg)
  })

  it('snapshot reports the power grid to clients', () => {
    const view = snapshot(calm(), 'alpha')
    // factory 30 + refinery 25 + uplink 20 drawn; centcomm 40 + plant 60 cap.
    expect(view.power).toEqual({ used: 75, cap: 100 })
  })

  it('a brownout freezes the factory line, the refinery and satellite charge', () => {
    let s = calm()
    // Lose the starting power plant: 75 used vs 40 cap.
    s.structures = s.structures.filter((st) => st.id !== 's-alpha-power')
    const eco = s.players[0]!.economy
    eco.credits = 99999
    eco.lithiumKg = 999
    eco.plasticKg = 999
    eco.oilKg = 100
    s.players[0]!.satellite.energy = 50

    const factory = s.structures.find((st) => st.playerId === 'alpha' && st.kind === 'factory')!
    s = tick(s, [{ type: 'build', playerId: 'alpha', structureId: factory.id, specId: 'fpv-strike' }]).state
    const ready0 = s.builds[0]!.readyAtTick
    const plastic0 = s.players[0]!.economy.plasticKg

    for (let t = 0; t < 20; t++) s = tick(s, []).state
    // The job slid a full tick per tick: zero progress.
    expect(s.builds[0]!.readyAtTick).toBe(ready0 + 20)
    expect(s.players[0]!.satellite.energy).toBeCloseTo(50)
    expect(s.players[0]!.economy.plasticKg).toBeCloseTo(plastic0)

    // A fresh plant ends the brownout and everything resumes.
    s = tick(s, [{ type: 'construct', playerId: 'alpha', kind: 'power-plant', at: SITE }]).state
    for (let t = 0; t < STRUCTURE_BUILD['power-plant']!.timeS * 20 + 2; t++) s = tick(s, []).state
    const readyAfterPower = s.builds[0]!.readyAtTick
    const energyAfterPower = s.players[0]!.satellite.energy
    const plasticAfterPower = s.players[0]!.economy.plasticKg
    for (let t = 0; t < 20; t++) s = tick(s, []).state
    expect(s.builds[0]!.readyAtTick).toBe(readyAfterPower)
    expect(s.players[0]!.satellite.energy).toBeGreaterThan(energyAfterPower)
    expect(s.players[0]!.economy.plasticKg).toBeGreaterThan(plasticAfterPower)
  })

  it('drone builds queue sequentially on one factory line', () => {
    let s = calm()
    const eco = s.players[0]!.economy
    eco.credits = 99999
    eco.lithiumKg = 999
    eco.plasticKg = 999
    const factory = s.structures.find((st) => st.playerId === 'alpha' && st.kind === 'factory')!
    s = tick(s, [
      { type: 'build', playerId: 'alpha', structureId: factory.id, specId: 'fpv-strike' },
      { type: 'build', playerId: 'alpha', structureId: factory.id, specId: 'fpv-strike' },
    ]).state
    const [a, b] = s.builds
    // fpv builds in 5 s = 100 ticks; the second starts when the first ends.
    expect(b!.readyAtTick - a!.readyAtTick).toBe(100)
  })

  it('an inactive factory takes no build orders', () => {
    let s = calm()
    const eco = s.players[0]!.economy
    eco.credits = 99999
    eco.lithiumKg = 999
    eco.plasticKg = 999
    s = tick(s, [{ type: 'construct', playerId: 'alpha', kind: 'factory', at: SITE }]).state
    const site = s.structures.find((st) => st.kind === 'factory' && st.readyAtTick !== undefined)!
    s = tick(s, [{ type: 'build', playerId: 'alpha', structureId: site.id, specId: 'fpv-strike' }]).state
    expect(s.builds.length).toBe(0)
  })
})
