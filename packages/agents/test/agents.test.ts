import { describe, expect, it } from 'vitest'
import { createMatch, makeDrone, snapshot, tick } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'
import { evaluatePolicies, overlordAct } from '@opticone/agents'
import { canPlaceStructure, type MatchState } from '@opticone/shared'

const P = ['human', 'bot'] as [string, string]

function calm(): MatchState {
  return createMatch(31, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
}

describe('C-07 policies', () => {
  it('returnAtBatteryPct sends a low drone home with policy origin', () => {
    let s = calm()
    const scout = s.drones.find((d) => d.playerId === 'human' && d.specId === 'mavic3')!
    scout.pos = { x: 2000, y: 60, z: 2000 }
    scout.batteryWh = 77 * 0.1
    s = tick(s, [
      {
        type: 'assignPolicy',
        playerId: 'human',
        droneIds: [scout.id],
        policy: { kind: 'returnAtBatteryPct', pct: 20 },
      },
    ]).state

    const commands = evaluatePolicies(snapshot(s, 'human'))
    const move = commands.find((c) => c.type === 'move')
    expect(move).toBeDefined()
    expect(move!.origin).toBe('policy')
    if (move?.type === 'move') expect(move.to.x).toBeLessThan(1000)
  })

  it('kamikazeOn attacks the nearest visible enemy inside the trigger radius', () => {
    let s = calm()
    const fpv = makeDrone(getDrone('fpv-strike')!, 'human', { x: 2000, y: 60, z: 2000 }, 'fpv-guard')
    s.drones.push(fpv)
    const intruder = makeDrone(getDrone('mavic3')!, 'bot', { x: 2200, y: 60, z: 2000 }, 'intruder')
    s.drones.push(intruder)
    s = tick(s, [
      {
        type: 'assignPolicy',
        playerId: 'human',
        droneIds: ['fpv-guard'],
        policy: { kind: 'kamikazeOn', radiusM: 600 },
      },
    ]).state

    const commands = evaluatePolicies(snapshot(s, 'human'))
    const attack = commands.find((c) => c.type === 'attack')
    expect(attack).toBeDefined()
    if (attack?.type === 'attack') expect(attack.targetId).toBe('intruder')
  })

  it('policies never read through the fog: a hidden enemy triggers nothing', () => {
    let s = calm()
    const fpv = makeDrone(getDrone('fpv-strike')!, 'human', { x: 700, y: 60, z: 700 }, 'fpv-guard')
    s.drones.push(fpv)
    // Enemy far outside any human sensor range.
    const hidden = makeDrone(getDrone('mavic3')!, 'bot', { x: 3300, y: 60, z: 3300 }, 'hidden')
    s.drones.push(hidden)
    s = tick(s, [
      {
        type: 'assignPolicy',
        playerId: 'human',
        droneIds: ['fpv-guard'],
        policy: { kind: 'kamikazeOn', radiusM: 999999 },
      },
    ]).state
    const commands = evaluatePolicies(snapshot(s, 'human'))
    const attacks = commands.filter((c) => c.type === 'attack')
    expect(attacks.some((a) => a.type === 'attack' && a.targetId === 'hidden')).toBe(false)
  })
})

describe('C-07 overlord', () => {
  it('is deterministic for the same view', () => {
    const s = tick(calm(), []).state
    const view = snapshot(s, 'bot')
    expect(overlordAct(view, 'normal')).toEqual(overlordAct(view, 'normal'))
  })

  it('builds an economy and a strike force from a fresh start', () => {
    let s = calm()
    let sawMining = false
    let sawBuild = false
    for (let t = 0; t < 90 * 20; t++) {
      const view = snapshot(s, 'bot')
      const commands = [...overlordAct(view, 'normal'), ...evaluatePolicies(view)]
      if (commands.some((c) => c.type === 'build')) sawBuild = true
      const r = tick(s, commands)
      s = r.state
      if (s.drones.some((d) => d.playerId === 'bot' && d.mode === 'mining')) sawMining = true
      if (s.winner) break
    }
    expect(sawBuild).toBe(true)
    expect(sawMining).toBe(true)
    const strikers = s.drones.filter((d) => d.playerId === 'bot' && d.specId === 'fpv-strike')
    expect(strikers.length).toBeGreaterThan(0)
  })
})

describe('C-07 overlord construction', () => {
  it('rebuilds the grid when browned out, on a legal site', () => {
    const s = calm()
    s.structures = s.structures.filter((st) => st.id !== 's-bot-power')
    const view = snapshot(s, 'bot')
    expect(view.power.used).toBeGreaterThan(view.power.cap)
    const cmd = overlordAct(view, 'normal').find((c) => c.type === 'construct')
    expect(cmd).toMatchObject({ type: 'construct', kind: 'power-plant', playerId: 'bot' })
    if (cmd?.type === 'construct') {
      expect(canPlaceStructure(view, 'bot', cmd.at.x, cmd.at.z)).toBe(true)
    }
  })

  it('rebuilds a lost factory', () => {
    const s = calm()
    s.structures = s.structures.filter((st) => st.id !== 's-bot-factory')
    const cmd = overlordAct(snapshot(s, 'bot'), 'normal').find((c) => c.type === 'construct')
    expect(cmd).toMatchObject({ type: 'construct', kind: 'factory' })
  })

  it('never starts a second site while one is under construction', () => {
    let s = calm()
    s.structures = s.structures.filter((st) => st.id !== 's-bot-power')
    const first = overlordAct(snapshot(s, 'bot'), 'normal').filter((c) => c.type === 'construct')
    expect(first.length).toBe(1)
    s = tick(s, first).state
    const again = overlordAct(snapshot(s, 'bot'), 'normal')
    expect(again.some((c) => c.type === 'construct')).toBe(false)
  })
})
