import { describe, expect, it } from 'vitest'
import { TERRAIN_AMPLITUDE, terrainHeight } from '@opticone/shared'

const MAP = 4000
const SEED = 1337

describe('C-04 terrain heightfield', () => {
  it('is deterministic: both players see the same relief', () => {
    for (const [x, z] of [[123, 456], [2000, 2000], [3777, 901]] as const) {
      expect(terrainHeight(MAP, SEED, x, z)).toBe(terrainHeight(MAP, SEED, x, z))
    }
  })

  it('stays within the visual amplitude so it never swallows flying drones', () => {
    for (let x = 0; x < MAP; x += 97) {
      for (let z = 0; z < MAP; z += 97) {
        const h = terrainHeight(MAP, SEED, x, z)
        expect(Math.abs(h)).toBeLessThanOrEqual(TERRAIN_AMPLITUDE)
      }
    }
  })

  it('is flat at both base corners so structures never clip', () => {
    for (const c of [{ x: 500, z: 500 }, { x: MAP - 500, z: MAP - 500 }]) {
      for (const [dx, dz] of [[0, 0], [90, 0], [-90, 0], [0, 90], [0, -90], [150, 150]] as const) {
        expect(terrainHeight(MAP, SEED, c.x + dx, c.z + dz)).toBeCloseTo(0, 5)
      }
    }
  })

  it('actually has relief away from the bases', () => {
    let maxAbs = 0
    for (let x = 1000; x < 3000; x += 53) {
      for (let z = 1000; z < 3000; z += 53) {
        maxAbs = Math.max(maxAbs, Math.abs(terrainHeight(MAP, SEED, x, z)))
      }
    }
    expect(maxAbs).toBeGreaterThan(5)
  })
})
