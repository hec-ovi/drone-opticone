import { describe, expect, it } from 'vitest'
import { createMatch, tick } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'
import { MARKET_RATE, type MatchState } from '@opticone/shared'
import { makeDrone } from '@opticone/sim-core'

const P = ['alpha', 'beta'] as [string, string]

function withMarket(): MatchState {
  const s = createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
  s.structures.push({
    id: 'mkt1',
    kind: 'market',
    playerId: 'alpha',
    pos: { x: 860, y: 0, z: 860 },
    hp: 1600,
    hpMax: 1600,
  })
  return s
}

describe('C-03 market', () => {
  it('sells a lot at the posted rate, clamped to the stockpile', () => {
    let s = withMarket()
    s.players[0]!.economy.plasticKg = 30 // less than the 50 kg lot
    const credits0 = s.players[0]!.economy.credits
    s = tick(s, [{ type: 'sell', playerId: 'alpha', resource: 'plasticKg', kg: 50 }]).state
    expect(s.players[0]!.economy.plasticKg).toBeCloseTo(0)
    expect(s.players[0]!.economy.credits).toBeCloseTo(credits0 + 30 * MARKET_RATE.plasticKg)
  })

  it('no market or a brownout means no trade', () => {
    // No market at all.
    let s = createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
    const credits0 = s.players[0]!.economy.credits
    s = tick(s, [{ type: 'sell', playerId: 'alpha', resource: 'plasticKg', kg: 50 }]).state
    expect(s.players[0]!.economy.plasticKg).toBeCloseTo(100)

    // Market, but the grid is browned out.
    let b = withMarket()
    b.structures = b.structures.filter((st) => st.id !== 's-alpha-power')
    b = tick(b, [{ type: 'sell', playerId: 'alpha', resource: 'plasticKg', kg: 50 }]).state
    expect(b.players[0]!.economy.plasticKg).toBeCloseTo(100)
    expect(b.players[0]!.economy.credits).toBeCloseTo(credits0)
  })

  it('power export rents the surplus for continuous credits, gated on the market', () => {
    let s = withMarket()
    s = tick(s, [{ type: 'setPowerExport', playerId: 'alpha', on: true }]).state
    const credits0 = s.players[0]!.economy.credits
    for (let t = 0; t < 20; t++) s = tick(s, []).state
    // Surplus: cap 100 vs used 75+10 market = 15 spare, 0.1 cr/s each, 1 s.
    expect(s.players[0]!.economy.credits).toBeCloseTo(credits0 + 15 * 0.1, 1)

    // Toggle off: income stops.
    s = tick(s, [{ type: 'setPowerExport', playerId: 'alpha', on: false }]).state
    const after = s.players[0]!.economy.credits
    for (let t = 0; t < 20; t++) s = tick(s, []).state
    expect(s.players[0]!.economy.credits).toBeCloseTo(after)
  })

  it('export pays nothing without a market', () => {
    let s = createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
    s = tick(s, [{ type: 'setPowerExport', playerId: 'alpha', on: true }]).state
    const credits0 = s.players[0]!.economy.credits
    for (let t = 0; t < 20; t++) s = tick(s, []).state
    expect(s.players[0]!.economy.credits).toBeCloseTo(credits0)
  })
})

describe('C-03 storehouse logistics', () => {
  it('miners deposit at the nearest drop-off instead of flying home', () => {
    let s = createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
    // A storehouse out by a far node, and a full miner right next to it.
    s.structures.push({
      id: 'store1',
      kind: 'storehouse',
      playerId: 'alpha',
      pos: { x: 2000, y: 0, z: 2000 },
      hp: 1600,
      hpMax: 1600,
    })
    const miner = makeDrone(getDrone('ore-miner')!, 'alpha', { x: 2100, y: 30, z: 2000 }, 'hauler')
    miner.cargoKg = 20
    miner.cargoKind = 'lithium'
    miner.mode = 'returning'
    s.drones.push(miner)
    const lithium0 = s.players[0]!.economy.lithiumKg

    for (let t = 0; t < 20 * 20 && s.players[0]!.economy.lithiumKg === lithium0; t++) s = tick(s, []).state
    expect(s.players[0]!.economy.lithiumKg).toBeCloseTo(lithium0 + 20)
    // It never trekked back to the base 2 km away.
    const hauler = s.drones.find((d) => d.id === 'hauler')!
    expect(Math.hypot(hauler.pos.x - 500, hauler.pos.z - 500)).toBeGreaterThan(1500)
  })
})
