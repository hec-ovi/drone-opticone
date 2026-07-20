import { describe, expect, it } from 'vitest'
import { mapTerrainSeed, terrainHeight } from '@opticone/shared'
import type { MatchState } from '@opticone/shared'
import { createMatch, makeDrone, snapshot, tick, TUNING } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'

const P = ['alpha', 'beta'] as [string, string]

function calm(): MatchState {
  return createMatch(51, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
}

function ground(s: MatchState, x: number, z: number): number {
  return terrainHeight(s.mapSizeM, s.terrainSeed, x, z)
}

/** Find a mid-map spot with meaningful elevation. */
function findHill(s: MatchState, minH: number): { x: number; z: number } {
  for (let x = 800; x < 3200; x += 40) {
    for (let z = 800; z < 3200; z += 40) {
      if (ground(s, x, z) >= minH) return { x, z }
    }
  }
  throw new Error('no hill found')
}

describe('C-03 terrain level', () => {
  it('the match uses the mapId-derived terrain seed and exposes it in the view', () => {
    const s = calm()
    expect(s.terrainSeed).toBe(mapTerrainSeed('map-1'))
    expect(snapshot(s, 'alpha').terrainSeed).toBe(s.terrainSeed)
  })

  it('structures and nodes sit on the terrain surface', () => {
    const s = calm()
    for (const st of s.structures) {
      expect(st.pos.y).toBeCloseTo(ground(s, st.pos.x, st.pos.z), 5)
    }
    for (const n of s.nodes) {
      expect(n.pos.y).toBeCloseTo(ground(s, n.pos.x, n.pos.z), 5)
    }
  })

  it('a quad flying over a hill climbs to hold its AGL', () => {
    let s = calm()
    const hill = findHill(s, 8)
    const spec = getDrone('mavic3')!
    const d = makeDrone(spec, 'alpha', { x: hill.x - 400, y: 60, z: hill.z }, 'hill-flyer')
    s.drones.push(d)

    s = tick(s, [
      { type: 'move', playerId: 'alpha', droneIds: ['hill-flyer'], to: { x: hill.x, y: 0, z: hill.z }, origin: 'policy' },
    ]).state
    for (let t = 0; t < 60 * 20; t++) {
      s = tick(s, []).state
      const dr = s.drones.find((x) => x.id === 'hill-flyer')
      if (!dr || dr.mode === 'idle') break
    }
    const arrived = s.drones.find((x) => x.id === 'hill-flyer')!
    const agl = arrived.pos.y - ground(s, arrived.pos.x, arrived.pos.z)
    expect(agl).toBeGreaterThan(40)
    expect(agl).toBeLessThan(80)
    expect(arrived.pos.y).toBeGreaterThan(60) // it had to climb above its start altitude
  })

  it('a wind-blown drone that drifts into rising terrain crashes', () => {
    let s = createMatch(51, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 15 } })
    // Find a slope that rises at least 2 m along the +x drift direction.
    const slope = (() => {
      for (let z = 800; z < 3200; z += 20) {
        for (let x = 800; x < 3000; x += 20) {
          if (ground(s, x + 120, z) - ground(s, x, z) >= 2) return { x, z }
        }
      }
      throw new Error('no rising slope found')
    })()
    const spec = getDrone('mavic3')! // wind limit 12 < 15: uncontrolled drift +x
    const start = { x: slope.x, y: ground(s, slope.x, slope.z) + 1, z: slope.z }
    s.drones.push(makeDrone(spec, 'alpha', start, 'doomed'))

    let crashed = false
    for (let t = 0; t < 90 * 20 && !crashed; t++) {
      const r = tick(s, [])
      s = r.state
      crashed = r.events.some((e) => e.type === 'destroyed' && e.entityId === 'doomed' && e.cause === 'terrain')
    }
    expect(crashed).toBe(true)
  })

  it('munitions impact on the relief, not at sea level', () => {
    let s = calm()
    const hill = findHill(s, 6)
    const h = ground(s, hill.x, hill.z)
    s.projectiles.push({
      id: 'p-test',
      playerId: 'alpha',
      pos: { x: hill.x, y: h + 2, z: hill.z },
      vel: { x: 0, y: 0, z: 0 },
      payloadKg: TUNING.munitionMassKg,
    })
    // Free fall of 2 m takes ~13 ticks. Falling all the way to sea level
    // (h + 2 m) would take well over 20; terrain impact must be sooner.
    let ticksToImpact = 0
    while (s.projectiles.some((p) => p.id === 'p-test') && ticksToImpact < 60) {
      s = tick(s, []).state
      ticksToImpact++
    }
    expect(ticksToImpact).toBeGreaterThan(5)
    expect(ticksToImpact).toBeLessThan(20)
  })

  it('determinism holds with terrain physics active', () => {
    const run = () => {
      let s = createMatch(777, 'map-1', P, getCatalog())
      for (let t = 0; t < 80; t++) s = tick(s, []).state
      return JSON.stringify(s)
    }
    expect(run()).toBe(run())
  })
})

describe('C-03 weather', () => {
  it('wind stays mostly flyable: storm drift is the exception, not the rule', () => {
    let s = createMatch(42, 'map-1', ['a', 'b'], getCatalog())
    s.drones = [] // weather only; no batteries to drain
    let stormTicks = 0
    const TICKS = 6000 // five simulated minutes
    for (let t = 0; t < TICKS; t++) {
      s = tick(s, []).state
      if (s.wind.speedMps > 10) stormTicks++
    }
    expect(s.wind.speedMps).toBeLessThanOrEqual(12)
    // Under a tenth of the match over the miners' 10 m/s limit.
    expect(stormTicks / TICKS).toBeLessThan(0.1)
  })
})
