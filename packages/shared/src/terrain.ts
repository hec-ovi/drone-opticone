/**
 * Deterministic terrain heightfield, shared by C-03 (authoritative physics)
 * and C-04 (rendering). Pure math, no dependencies. Same mapId means the
 * same relief for both players.
 */

export const TERRAIN_AMPLITUDE = 26

const NOISE_SCALE = 1 / 700

export function terrainHash2(x: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}

export function terrainSmooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = terrainSmooth(x - xi)
  const zf = terrainSmooth(z - zi)
  const a = terrainHash2(xi, zi, seed)
  const b = terrainHash2(xi + 1, zi, seed)
  const c = terrainHash2(xi, zi + 1, seed)
  const d = terrainHash2(xi + 1, zi + 1, seed)
  return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf
}

export function terrainFbm(x: number, z: number, seed: number, octaves = 4): number {
  let value = 0
  let amp = 0.5
  let freq = 1
  for (let o = 0; o < octaves; o++) {
    value += amp * valueNoise(x * freq, z * freq, seed + o * 13)
    amp *= 0.5
    freq *= 2
  }
  return value
}

/** Relief fades to zero near both base corners so structures never clip. */
function baseFlatten(mapSize: number, x: number, z: number): number {
  const corners = [
    { x: 500, z: 500 },
    { x: mapSize - 500, z: mapSize - 500 },
  ]
  let factor = 1
  for (const c of corners) {
    const d = Math.hypot(x - c.x, z - c.z)
    factor = Math.min(factor, terrainSmooth(Math.max(0, Math.min(1, (d - 220) / 400))))
  }
  return factor
}

export function terrainHeight(mapSize: number, seed: number, x: number, z: number): number {
  const n = terrainFbm(x * NOISE_SCALE, z * NOISE_SCALE, seed)
  return (n - 0.45) * TERRAIN_AMPLITUDE * baseFlatten(mapSize, x, z)
}

export function terrainNoiseScale(): number {
  return NOISE_SCALE
}

/** Stable seed from a map id (FNV-1a). */
export function mapTerrainSeed(mapId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < mapId.length; i++) {
    h ^= mapId.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 100000
}
