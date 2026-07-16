import { describe, expect, it } from 'vitest'
import { createMatch, tick, buildCost } from '@opticone/sim-core'
import { getCatalog, getDrone } from '@opticone/registry'
import type { MatchState } from '@opticone/shared'

const P = ['alpha', 'beta'] as [string, string]

function calm(): MatchState {
  return createMatch(11, 'map-1', P, getCatalog(), { fixedWind: { dirRad: 0, speedMps: 2 } })
}

describe('C-03 economy', () => {
  it('a mining drone harvests a node and deposits lithium at the base', () => {
    let s = calm()
    const miner = s.drones.find((d) => d.playerId === 'alpha' && d.specId === 'ore-miner')!
    const node = s.nodes.find((n) => n.kind === 'lithium')!
    // Park the miner on the node with an almost full hold to keep the test fast.
    miner.pos = { x: node.pos.x, y: 30, z: node.pos.z }
    const lithium0 = s.players[0]!.economy.lithiumKg
    const node0 = node.remainingKg

    s = tick(s, [{ type: 'mine', playerId: 'alpha', droneIds: [miner.id], nodeId: node.id }]).state
    const m = s.drones.find((d) => d.id === miner.id)!
    m.cargoKg = getDrone('ore-miner')!.payloadKg - 0.01
    m.cargoKind = 'lithium'

    for (let t = 0; t < 60 * 20 && s.players[0]!.economy.lithiumKg <= lithium0; t++) {
      s = tick(s, []).state
    }
    expect(s.players[0]!.economy.lithiumKg).toBeGreaterThan(lithium0)
    const nodeAfter = s.nodes.find((n) => n.id === node.id)!
    expect(nodeAfter.remainingKg).toBeLessThan(node0)
  })

  it('build consumes resources and spawns the drone at the factory after the build time', () => {
    let s = calm()
    const eco0 = structuredClone(s.players[0]!.economy)
    const cost = buildCost(getDrone('fpv-strike')!)
    const countBefore = s.drones.filter((d) => d.playerId === 'alpha').length

    s = tick(s, [{ type: 'build', playerId: 'alpha', structureId: 's-alpha-factory', specId: 'fpv-strike' }]).state
    expect(s.players[0]!.economy.credits).toBeCloseTo(eco0.credits - cost.credits, 5)
    expect(s.players[0]!.economy.lithiumKg).toBeCloseTo(eco0.lithiumKg - cost.lithiumKg, 5)
    expect(s.builds.length).toBe(1)

    for (let t = 0; t < 6 * 20; t++) s = tick(s, []).state
    const fresh = s.drones.filter((d) => d.playerId === 'alpha')
    expect(fresh.length).toBe(countBefore + 1)
    expect(fresh.some((d) => d.specId === 'fpv-strike')).toBe(true)
  })

  it('build is refused when resources are missing', () => {
    let s = calm()
    s.players[0]!.economy.credits = 0
    s = tick(s, [{ type: 'build', playerId: 'alpha', structureId: 's-alpha-factory', specId: 'fpv-strike' }]).state
    expect(s.builds.length).toBe(0)
  })

  it('the refinery converts oil into plastic over time', () => {
    let s = calm()
    s.players[0]!.economy.oilKg = 10
    const plastic0 = s.players[0]!.economy.plasticKg
    for (let t = 0; t < 40; t++) s = tick(s, []).state
    expect(s.players[0]!.economy.oilKg).toBeCloseTo(8, 1)
    expect(s.players[0]!.economy.plasticKg).toBeCloseTo(plastic0 + 1, 1)
  })
})
