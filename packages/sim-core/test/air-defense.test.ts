import { describe, expect, it } from 'vitest'
import { createMatch, makeDrone, snapshot, tick } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'
import type { MatchState } from '@opticone/shared'

const P = ['alpha', 'beta'] as [string, string]

/** Calm match with an active alpha SAM battery at (900, 900). */
function withBattery(): MatchState {
  const s = createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
  s.structures.push({
    id: 'ad1',
    kind: 'air-defense',
    playerId: 'alpha',
    pos: { x: 900, y: 0, z: 900 },
    hp: 900,
    hpMax: 900,
  })
  return s
}

describe('C-03 air defense', () => {
  it('shoots down an intruding drone and reports the kill', () => {
    let s = withBattery()
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 1000, y: 60, z: 1000 }, 'intruder'))
    const r = tick(s, [])
    s = r.state
    expect(s.drones.find((d) => d.id === 'intruder')).toBeUndefined()
    expect(
      r.events.some((e) => e.type === 'destroyed' && e.entityId === 'intruder' && e.cause === 'munition'),
    ).toBe(true)
  })

  it('fires once per cooldown: two intruders die one after the other', () => {
    let s = withBattery()
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 1000, y: 60, z: 1000 }, 'i1'))
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 950, y: 60, z: 1050 }, 'i2'))
    const intruders = (state: MatchState) => state.drones.filter((d) => d.id === 'i1' || d.id === 'i2')
    for (let t = 0; t < 5; t++) s = tick(s, []).state
    expect(intruders(s).length).toBe(1)
    // 2.5 s cooldown = 50 ticks; the second one falls on the next shot.
    for (let t = 0; t < 60; t++) s = tick(s, []).state
    expect(intruders(s).length).toBe(0)
  })

  it('intercepts an incoming munition before the next drone shot', () => {
    let s = withBattery()
    s.projectiles.push({
      id: 'p1',
      playerId: 'beta',
      pos: { x: 1000, y: 200, z: 900 },
      vel: { x: 0, y: 0, z: 0 },
      payloadKg: 25,
    })
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 1000, y: 60, z: 1000 }, 'escort'))
    s = tick(s, []).state
    // The munition dies first; the escort survives this shot.
    expect(s.projectiles.length).toBe(0)
    expect(s.drones.find((d) => d.id === 'escort')).toBeDefined()
  })

  it('goes dark without grid power', () => {
    let s = withBattery()
    s.structures = s.structures.filter((st) => st.id !== 's-alpha-power')
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 1000, y: 60, z: 1000 }, 'intruder'))
    for (let t = 0; t < 10; t++) s = tick(s, []).state
    expect(s.drones.find((d) => d.id === 'intruder')).toBeDefined()
  })

  it('is a detector: powered radar reveals drones far beyond normal structure sight', () => {
    let s = withBattery()
    // 700 m out: past the 500 m structure sight, inside the 800 m radar.
    s.drones.push(makeDrone(getDrone('mavic3')!, 'beta', { x: 1600, y: 60, z: 900 }, 'spotted'))
    s = tick(s, []).state
    expect(snapshot(s, 'alpha').enemyDrones.some((d) => d.id === 'spotted')).toBe(true)
  })
})
