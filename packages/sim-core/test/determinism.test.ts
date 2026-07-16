import { describe, expect, it } from 'vitest'
import { stateHash, type IssuedCommand, type MatchState } from '@opticone/shared'
import { getCatalog } from '@opticone/registry'
import { createMatch, tick } from '@opticone/sim-core'

const P = ['alpha', 'beta'] as [string, string]

function scripted(state: MatchState, ticks: number): MatchState {
  let s = state
  for (let t = 0; t < ticks; t++) {
    const commands: IssuedCommand[] = []
    if (t === 3) {
      const miner = s.drones.find((d) => d.playerId === 'alpha' && d.specId === 'ore-miner')
      const node = s.nodes[0]
      if (miner && node) commands.push({ type: 'mine', playerId: 'alpha', droneIds: [miner.id], nodeId: node.id })
    }
    if (t === 5) {
      commands.push({
        type: 'build',
        playerId: 'beta',
        structureId: 's-beta-factory',
        specId: 'fpv-strike',
      })
    }
    if (t === 10) {
      const scout = s.drones.find((d) => d.playerId === 'alpha' && d.specId === 'mavic3')
      if (scout) commands.push({ type: 'move', playerId: 'alpha', droneIds: [scout.id], to: { x: 2000, y: 0, z: 2000 } })
    }
    if (t === 20) commands.push({ type: 'satelliteSweep', playerId: 'beta', center: { x: 500, z: 500 } })
    s = tick(s, commands).state
  }
  return s
}

describe('C-03 determinism', () => {
  it('same seed and same commands produce bit-identical state hashes', () => {
    const a = scripted(createMatch(1234, 'map-1', P, getCatalog()), 120)
    const b = scripted(createMatch(1234, 'map-1', P, getCatalog()), 120)
    expect(stateHash(a)).toBe(stateHash(b))
    expect(a.tick).toBe(120)
  })

  it('a different seed diverges', () => {
    const a = scripted(createMatch(1234, 'map-1', P, getCatalog()), 60)
    const b = scripted(createMatch(4321, 'map-1', P, getCatalog()), 60)
    expect(stateHash(a)).not.toBe(stateHash(b))
  })

  it('tick is pure: the input state is not mutated', () => {
    const s0 = createMatch(99, 'map-1', P, getCatalog())
    const before = stateHash(s0)
    tick(s0, [])
    expect(stateHash(s0)).toBe(before)
  })
})
