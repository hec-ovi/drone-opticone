import { describe, expect, it } from 'vitest'
import { createMatch, makeDrone, snapshot, tick } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'
import { AIR_DEFENSE_AMMO_MAX, type MatchState } from '@opticone/shared'

const P = ['alpha', 'beta'] as [string, string]

/** Calm match with an active, fully loaded alpha SAM battery at (900, 900). */
function withBattery(): MatchState {
  const s = createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
  s.structures.push({
    id: 'ad1',
    kind: 'air-defense',
    playerId: 'alpha',
    pos: { x: 900, y: 0, z: 900 },
    hp: 1800,
    hpMax: 1800,
    ammo: AIR_DEFENSE_AMMO_MAX,
  })
  return s
}

const battery = (s: MatchState) => s.structures.find((st) => st.id === 'ad1')!

describe('C-03 air defense (interceptor missiles)', () => {
  it('launches a visible homing missile that chases and kills the intruder', () => {
    let s = withBattery()
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 1200, y: 60, z: 900 }, 'intruder'))
    s = tick(s, []).state
    // One missile in the air, one round out of the rack.
    const missile = s.projectiles.find((p) => p.homingTargetId === 'intruder')
    expect(missile).toBeDefined()
    expect(missile!.playerId).toBe('alpha')
    expect(battery(s).ammo).toBe(AIR_DEFENSE_AMMO_MAX - 1)

    // 300 m at 220 m/s: the kill lands within a few seconds.
    const events = []
    for (let t = 0; t < 4 * 20 && s.drones.some((d) => d.id === 'intruder'); t++) {
      const r = tick(s, [])
      s = r.state
      events.push(...r.events)
    }
    expect(s.drones.find((d) => d.id === 'intruder')).toBeUndefined()
    expect(events.some((e) => e.type === 'destroyed' && e.entityId === 'intruder' && e.cause === 'munition')).toBe(true)
  })

  it('intercepts an incoming munition midair', () => {
    let s = withBattery()
    s.projectiles.push({
      id: 'bomb',
      playerId: 'beta',
      pos: { x: 1000, y: 300, z: 900 },
      vel: { x: 0, y: 0, z: 0 },
      payloadKg: 25,
    })
    for (let t = 0; t < 3 * 20 && s.projectiles.some((p) => p.id === 'bomb'); t++) s = tick(s, []).state
    expect(s.projectiles.some((p) => p.id === 'bomb')).toBe(false)
  })

  it('the rack is finite: no plastic and no credits means no reloads', () => {
    let s = withBattery()
    battery(s).ammo = 1
    s.players[0]!.economy.plasticKg = 0
    s.players[0]!.economy.credits = 0
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 1000, y: 60, z: 900 }, 'i1'))
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 950, y: 60, z: 1050 }, 'i2'))
    for (let t = 0; t < 10 * 20; t++) s = tick(s, []).state
    // One missile, one kill; the second intruder loiters unharmed.
    expect(battery(s).ammo).toBe(0)
    expect(s.drones.filter((d) => d.id === 'i1' || d.id === 'i2').length).toBe(1)
  })

  it('auto-reload refills one missile per cycle and bills plastic + credits', () => {
    let s = withBattery()
    battery(s).ammo = 0
    const plastic0 = s.players[0]!.economy.plasticKg
    const credits0 = s.players[0]!.economy.credits
    s = tick(s, []).state // first reload is immediate
    expect(battery(s).ammo).toBe(1)
    expect(s.players[0]!.economy.plasticKg).toBeCloseTo(plastic0 - 4)
    expect(s.players[0]!.economy.credits).toBeCloseTo(credits0 - 40)
    // The next round waits out the 5 s reload cycle.
    for (let t = 0; t < 4 * 20; t++) s = tick(s, []).state
    expect(battery(s).ammo).toBe(1)
    for (let t = 0; t < 2 * 20; t++) s = tick(s, []).state
    expect(battery(s).ammo).toBe(2)
  })

  it('goes dark without grid power: no shots, no reloads', () => {
    let s = withBattery()
    s.structures = s.structures.filter((st) => st.id !== 's-alpha-power')
    battery(s).ammo = 3
    s.drones.push(makeDrone(getDrone('fpv-strike')!, 'beta', { x: 1000, y: 60, z: 900 }, 'intruder'))
    for (let t = 0; t < 10; t++) s = tick(s, []).state
    expect(s.drones.find((d) => d.id === 'intruder')).toBeDefined()
    expect(battery(s).ammo).toBe(3)
    expect(s.projectiles.length).toBe(0)
  })

  it('is a detector: powered radar reveals drones far beyond normal structure sight', () => {
    let s = withBattery()
    // 700 m out: past the 500 m structure sight, inside the 800 m radar.
    s.drones.push(makeDrone(getDrone('mavic3')!, 'beta', { x: 1600, y: 60, z: 900 }, 'spotted'))
    s = tick(s, []).state
    expect(snapshot(s, 'alpha').enemyDrones.some((d) => d.id === 'spotted')).toBe(true)
  })
})
