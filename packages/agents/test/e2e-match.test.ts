import { describe, expect, it } from 'vitest'
import { createMatch, snapshot, tick } from '@opticone/sim-core'
import { getCatalog } from '@opticone/registry'
import { evaluatePolicies, overlordAct } from '@opticone/agents'

/**
 * End-to-end match: the overlord plays a full game through the real sim,
 * from empty economy to destroying the enemy centcomm. Calm fixed wind so
 * the run is deterministic and cannot stall on a gale.
 */
describe('e2e: overlord finishes a match', () => {
  it('hard overlord defeats an idle opponent by destroying its centcomm', () => {
    let s = createMatch(7, 'map-1', ['idle', 'bot'], getCatalog(), {
      fixedWind: { dirRad: 1, speedMps: 5 },
    })
    const MAX_TICKS = 40000 // ~33 sim minutes cap
    while (!s.winner && s.tick < MAX_TICKS) {
      const view = snapshot(s, 'bot')
      s = tick(s, [...overlordAct(view, 'hard'), ...evaluatePolicies(view)]).state
    }
    expect(s.winner).toBe('bot')
    // The idle base is gone, the bot base still stands.
    expect(s.structures.some((st) => st.playerId === 'idle' && st.kind === 'centcomm')).toBe(false)
    expect(s.structures.some((st) => st.playerId === 'bot' && st.kind === 'centcomm')).toBe(true)
  }, 180000)
})
