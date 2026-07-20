import * as THREE from 'three/webgpu'
import type { DroneSpec, NodeKind, StructureKind, ThumbnailSet } from '@opticone/shared'
import { makeDroneModel } from './models'
import { makeNodeObject, makeStructureObject } from './props'

/**
 * Offscreen thumbnail factory: renders every drone, structure and node model
 * once with the same 3/4 camera and studio lighting, so the whole UI shows
 * the real units instead of drawn icons. Returns data URLs; empty set when
 * headless (no WebGL/2d canvas).
 */

const SIZE = 176

function frameObject(camera: THREE.PerspectiveCamera, obj: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(obj)
  const center = box.getCenter(new THREE.Vector3())
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const dist = (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.18
  const dir = new THREE.Vector3(1, 0.72, 0.85).normalize()
  camera.position.copy(center).addScaledVector(dir, dist)
  camera.near = dist / 50
  camera.far = dist * 50
  camera.updateProjectionMatrix()
  camera.lookAt(center)
}

export async function generateThumbnails(catalog: Record<string, DroneSpec>): Promise<ThumbnailSet> {
  const empty: ThumbnailSet = { drones: {}, structures: {}, nodes: {} }
  try {
    const out = document.createElement('canvas')
    out.width = SIZE
    out.height = SIZE
    const ctx = out.getContext('2d')
    if (!ctx) return empty

    const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true, forceWebGL: true })
    await renderer.init()
    renderer.setSize(SIZE, SIZE, false)
    renderer.setClearColor(0x000000, 0) // keep the thumbnail background transparent
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x2c2a26, 1.1))
    const key = new THREE.DirectionalLight(0xfff0dc, 2.2)
    key.position.set(3, 5, 2.4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x66c8ff, 1.2)
    rim.position.set(-4, 2, -3)
    scene.add(rim)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)

    const snap = (obj: THREE.Object3D): string => {
      scene.add(obj)
      frameObject(camera, obj)
      renderer.render(scene, camera)
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.drawImage(renderer.domElement, 0, 0, SIZE, SIZE)
      scene.remove(obj)
      return out.toDataURL('image/png')
    }

    const set: ThumbnailSet = { drones: {}, structures: {}, nodes: {} }
    for (const spec of Object.values(catalog)) {
      set.drones[spec.id] = snap(makeDroneModel(spec, true).root)
    }
    const kinds: StructureKind[] = [
      'centcomm',
      'refinery',
      'factory',
      'relay',
      'satellite-uplink',
      'power-plant',
      'air-defense',
      'market',
      'storehouse',
    ]
    for (const kind of kinds) {
      set.structures[kind] = snap(makeStructureObject(kind, true))
    }
    for (const kind of ['lithium', 'oil'] as NodeKind[]) {
      set.nodes[kind] = snap(makeNodeObject(kind))
    }
    renderer.dispose()
    return set
  } catch {
    return empty
  }
}
