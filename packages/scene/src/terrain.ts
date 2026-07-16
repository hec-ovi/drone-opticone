import * as THREE from 'three/webgpu'

/**
 * Deterministic procedural terrain. Same mapId means same terrain for both
 * players, so it is safe to generate client-side: it is pure decoration
 * layered under the 1:1 sim, with gentle relief that flattens around the two
 * base corners so structures never clip.
 */

function hash2(x: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = smooth(x - xi)
  const zf = smooth(z - zi)
  const a = hash2(xi, zi, seed)
  const b = hash2(xi + 1, zi, seed)
  const c = hash2(xi, zi + 1, seed)
  const d = hash2(xi + 1, zi + 1, seed)
  return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf
}

function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let value = 0
  let amp = 0.5
  let freq = 1
  for (let o = 0; o < octaves; o++) {
    value += amp * valueNoise(x * freq, z * freq, seed + o * 13)
    amp *= 0.5
    freq *= 2
  }
  return value // 0..~1
}

export interface Terrain {
  mesh: THREE.Mesh
  heightAt(x: number, z: number): number
}

const AMPLITUDE = 26
const NOISE_SCALE = 1 / 700

/** Relief fades to zero near both base corners. */
function baseFlatten(mapSize: number, x: number, z: number): number {
  const corners = [
    { x: 500, z: 500 },
    { x: mapSize - 500, z: mapSize - 500 },
  ]
  let factor = 1
  for (const c of corners) {
    const d = Math.hypot(x - c.x, z - c.z)
    factor = Math.min(factor, smooth(Math.max(0, Math.min(1, (d - 220) / 400))))
  }
  return factor
}

export function terrainHeight(mapSize: number, seed: number, x: number, z: number): number {
  const n = fbm(x * NOISE_SCALE, z * NOISE_SCALE, seed)
  return (n - 0.45) * AMPLITUDE * baseFlatten(mapSize, x, z)
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function makeGroundTexture(mapSize: number, seed: number): THREE.CanvasTexture {
  const size = 2048
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  // Palette bands blended by height and moisture: lowland scrub, steppe
  // grass, dry earth, rock caps. Matches the dark UI.
  const SCRUB: [number, number, number] = [46, 64, 36]
  const GRASS: [number, number, number] = [72, 86, 44]
  const EARTH: [number, number, number] = [110, 92, 60]
  const ROCK: [number, number, number] = [98, 100, 96]
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const wx = (i / size) * mapSize
      const wz = (j / size) * mapSize
      const h = fbm(wx * NOISE_SCALE, wz * NOISE_SCALE, seed)
      const moist = fbm(wx * NOISE_SCALE * 2.3, wz * NOISE_SCALE * 2.3, seed + 31)
      const detail = fbm(wx * NOISE_SCALE * 14, wz * NOISE_SCALE * 14, seed + 7)
      const grain = hash2(i, j, seed + 51)

      let color = mix(SCRUB, GRASS, smooth(Math.max(0, Math.min(1, (moist - 0.35) / 0.3))))
      color = mix(color, EARTH, smooth(Math.max(0, Math.min(1, (0.55 - moist) / 0.25))))
      color = mix(color, ROCK, smooth(Math.max(0, Math.min(1, (h - 0.68) / 0.12))))

      // High-frequency detail plus per-pixel grain so it holds up zoomed in.
      const shade = 0.72 + detail * 0.42 + (grain - 0.5) * 0.12
      const o = (j * size + i) * 4
      img.data[o] = Math.min(255, color[0] * shade)
      img.data[o + 1] = Math.min(255, color[1] * shade)
      img.data[o + 2] = Math.min(255, color[2] * shade)
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function makeTerrain(mapSize: number, seed: number): Terrain {
  const segments = 160
  const geometry = new THREE.PlaneGeometry(mapSize, mapSize, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(mapSize / 2, 0, mapSize / 2)
  const pos = geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, terrainHeight(mapSize, seed, x, z))
  }
  geometry.computeVertexNormals()

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(mapSize, seed) }),
  )
  return {
    mesh,
    heightAt: (x, z) => terrainHeight(mapSize, seed, x, z),
  }
}
