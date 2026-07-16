import * as THREE from 'three/webgpu'
import { terrainFbm, terrainHash2, terrainHeight, terrainNoiseScale, terrainSmooth } from '@opticone/shared'

/**
 * Terrain rendering. The heightfield itself lives in @opticone/shared and is
 * authoritative in the sim (C-03): drones follow it, crash into it, and
 * munitions impact on it. This module only builds the mesh and texture.
 */
export interface Terrain {
  mesh: THREE.Mesh
  heightAt(x: number, z: number): number
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function makeGroundTexture(mapSize: number, seed: number): THREE.CanvasTexture {
  const size = 2048
  const NOISE_SCALE = terrainNoiseScale()
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
      const h = terrainFbm(wx * NOISE_SCALE, wz * NOISE_SCALE, seed)
      const moist = terrainFbm(wx * NOISE_SCALE * 2.3, wz * NOISE_SCALE * 2.3, seed + 31)
      const detail = terrainFbm(wx * NOISE_SCALE * 14, wz * NOISE_SCALE * 14, seed + 7)
      const grain = terrainHash2(i, j, seed + 51)

      let color = mix(SCRUB, GRASS, terrainSmooth(Math.max(0, Math.min(1, (moist - 0.35) / 0.3))))
      color = mix(color, EARTH, terrainSmooth(Math.max(0, Math.min(1, (0.55 - moist) / 0.25))))
      color = mix(color, ROCK, terrainSmooth(Math.max(0, Math.min(1, (h - 0.68) / 0.12))))

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
    pos.setY(i, terrainHeight(mapSize, seed, pos.getX(i), pos.getZ(i)))
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
