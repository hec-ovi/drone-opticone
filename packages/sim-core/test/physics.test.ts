import { describe, expect, it } from 'vitest'
import { dist2D, createMatch, makeDrone, tick } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'
import type { MatchState } from '@opticone/shared'

const P = ['alpha', 'beta'] as [string, string]

function calmMatch(windMps = 3): MatchState {
  return createMatch(7, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: windMps } })
}

describe('C-03 physics sanity (from C-01 real specs)', () => {
  it('a Mavic-class quad cannot fly in 15 m/s wind: it drifts downwind, ignoring orders', () => {
    let s = createMatch(7, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 15 } })
    const scout = s.drones.find((d) => d.playerId === 'alpha' && d.specId === 'mavic3')!
    const startX = scout.pos.x
    // Order it to fly upwind (negative x). Wind limit for the Mavic 3 is 12 m/s.
    for (let t = 0; t < 40; t++) {
      s = tick(s, [{ type: 'move', playerId: 'alpha', droneIds: [scout.id], to: { x: 0, y: 0, z: scout.pos.z } }]).state
    }
    const after = s.drones.find((d) => d.id === scout.id)!
    expect(after.pos.x).toBeGreaterThan(startX)
    expect(after.uncontrolled).toBe(true)
  })

  it('the same quad in calm wind reaches its destination', () => {
    let s = calmMatch()
    const scout = s.drones.find((d) => d.playerId === 'alpha' && d.specId === 'mavic3')!
    const dest = { x: scout.pos.x + 300, y: 0, z: scout.pos.z }
    s = tick(s, [{ type: 'move', playerId: 'alpha', droneIds: [scout.id], to: dest }]).state
    for (let t = 0; t < 30 * 20; t++) {
      s = tick(s, []).state
      const d = s.drones.find((x) => x.id === scout.id)!
      if (d.mode === 'idle') break
    }
    const after = s.drones.find((d) => d.id === scout.id)!
    expect(dist2D(after.pos, { ...dest, y: after.pos.y })).toBeLessThan(20)
  })

  it('a Shahed-class delta wing cannot hover: it keeps moving even when idle', () => {
    let s = calmMatch()
    const shahed = makeDrone(getDrone('shahed136')!, 'alpha', { x: 2000, y: 600, z: 2000 }, 'test-shahed')
    s.drones.push(shahed)
    const positions: number[] = []
    for (let t = 0; t < 40; t++) {
      const prev = structuredClone(s.drones.find((d) => d.id === 'test-shahed')!.pos)
      s = tick(s, []).state
      const cur = s.drones.find((d) => d.id === 'test-shahed')!.pos
      positions.push(dist2D(prev, cur))
    }
    const perTick = getDrone('shahed136')!.cruiseMps * (1 / 20)
    for (const moved of positions) expect(moved).toBeGreaterThan(perTick * 0.5)
  })

  it('a multirotor CAN hover: idle means stationary', () => {
    let s = calmMatch()
    const scout = s.drones.find((d) => d.playerId === 'alpha' && d.specId === 'mavic3')!
    const start = structuredClone(scout.pos)
    for (let t = 0; t < 40; t++) s = tick(s, []).state
    const after = s.drones.find((d) => d.id === scout.id)!
    expect(dist2D(start, after.pos)).toBeLessThan(1)
  })

  it('hovering drains the battery at the endurance-derived rate and an empty battery is a crash', () => {
    let s = calmMatch()
    const scout = s.drones.find((d) => d.playerId === 'alpha' && d.specId === 'mavic3')!
    const wh0 = scout.batteryWh
    for (let t = 0; t < 20; t++) s = tick(s, []).state
    const after = s.drones.find((d) => d.id === scout.id)!
    // Mavic 3: 77 Wh over 2760 s. One second of hover is roughly 0.0279 Wh.
    const expected = (77 * 1) / 2760
    expect(wh0 - after.batteryWh).toBeCloseTo(expected, 3)

    // Now run it dry.
    const dying = s.drones.find((d) => d.id === scout.id)!
    dying.batteryWh = 0.001
    const r = tick(s, [])
    expect(r.state.drones.some((d) => d.id === scout.id)).toBe(false)
    expect(r.events.some((e) => e.type === 'destroyed' && e.cause === 'battery')).toBe(true)
  })

  it('drones cannot climb above their service ceiling', () => {
    let s = calmMatch()
    const scout = s.drones.find((d) => d.playerId === 'alpha' && d.specId === 'mavic3')!
    scout.pos.y = 50000
    s = tick(s, []).state
    const after = s.drones.find((d) => d.id === scout.id)!
    expect(after.pos.y).toBeLessThanOrEqual(getDrone('mavic3')!.ceilingM)
  })

  it('player commands are refused outside control range, policy commands are not', () => {
    let s = calmMatch()
    const spec = structuredClone(getDrone('mavic3')!)
    spec.id = 'shortleash'
    spec.controlRangeM = 500
    s.catalog['shortleash'] = spec
    const far = makeDrone(spec, 'alpha', { x: 2000, y: 60, z: 2000 }, 'far-drone')
    s.drones.push(far)

    s = tick(s, [{ type: 'move', playerId: 'alpha', droneIds: ['far-drone'], to: { x: 100, y: 0, z: 100 } }]).state
    expect(s.drones.find((d) => d.id === 'far-drone')!.mode).toBe('idle')

    s = tick(s, [
      { type: 'move', playerId: 'alpha', droneIds: ['far-drone'], to: { x: 100, y: 0, z: 100 }, origin: 'policy' },
    ]).state
    expect(s.drones.find((d) => d.id === 'far-drone')!.mode).toBe('moving')
  })
})
