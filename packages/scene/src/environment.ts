import * as THREE from 'three/webgpu'
import { glowSpriteMaterial } from './glowtex'

/**
 * Atmosphere and ground clutter: a vertex-colored sky dome (works on both
 * WebGPU and the WebGL fallback, no shader code), a sun glow, and instanced
 * rocks and shrubs scattered deterministically from the terrain seed.
 */

/** Small deterministic LCG so scatter is identical for a given seed. */
export function makeLcg(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

export function makeSky(radius: number): THREE.Group {
  const group = new THREE.Group()
  const geo = new THREE.SphereGeometry(radius, 24, 16)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const below = new THREE.Color(0x07090d)
  const zenith = new THREE.Color(0x0a1420)
  const mid = new THREE.Color(0x18293c)
  const horizon = new THREE.Color(0x3d3a33)
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(-1, Math.min(1, pos.getY(i) / radius))
    // Everything under the horizon fades to near-black so the dome never
    // paints the void around the map a bright color.
    const c =
      t < 0
        ? below.clone().lerp(horizon, Math.max(0, 1 + t * 8))
        : t < 0.14
          ? horizon.clone().lerp(mid, t / 0.14)
          : mid.clone().lerp(zenith, (t - 0.14) / 0.86)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const dome = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  )
  dome.renderOrder = -10
  group.add(dome)

  // Low sun glow on the horizon, matching the directional light bearing.
  const sunMat = glowSpriteMaterial(0xffd9a0, 0.55)
  sunMat.fog = false
  const sun = new THREE.Sprite(sunMat)
  sun.scale.setScalar(radius * 0.22)
  sun.position.set(radius * 0.42, radius * 0.3, radius * 0.22)
  group.add(sun)
  return group
}

export interface ScatterOpts {
  mapSize: number
  seed: number
  heightAt(x: number, z: number): number
  /** keep-out discs (bases, nodes) so clutter never overlaps gameplay props */
  avoid: { x: number; z: number; r: number }[]
}

export function makeScatter(opts: ScatterOpts): THREE.Group {
  const group = new THREE.Group()
  const rand = makeLcg(opts.seed ^ 0x5ca77e12)

  const clear = (x: number, z: number) =>
    opts.avoid.every((a) => Math.hypot(x - a.x, z - a.z) > a.r)

  const place = (
    mesh: THREE.InstancedMesh,
    count: number,
    scaleMin: number,
    scaleMax: number,
    sink: number,
  ) => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 4) {
      const x = rand() * opts.mapSize
      const z = rand() * opts.mapSize
      if (!clear(x, z)) continue
      const s = scaleMin + rand() * (scaleMax - scaleMin)
      q.setFromAxisAngle(up, rand() * Math.PI * 2)
      m.compose(
        new THREE.Vector3(x, opts.heightAt(x, z) - sink * s, z),
        q,
        new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s),
      )
      mesh.setMatrixAt(placed, m)
      placed++
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }

  const rockGeo = new THREE.IcosahedronGeometry(6, 0)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x62676b, roughness: 0.9, flatShading: true })
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 260)
  rocks.castShadow = true
  rocks.receiveShadow = true
  place(rocks, 260, 0.6, 2.6, 0.45)

  const shrubGeo = new THREE.ConeGeometry(5, 9, 6)
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x3d4d2c, roughness: 1, flatShading: true })
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, 380)
  shrubs.castShadow = true
  place(shrubs, 380, 0.5, 1.6, 0.1)

  const tuftGeo = new THREE.ConeGeometry(2.4, 3.6, 5)
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x6a6f3d, roughness: 1, flatShading: true })
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 420)
  place(tufts, 420, 0.6, 1.4, 0.1)

  return group
}
