import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three/webgpu'
import { SEED_DRONES } from '@opticone/registry'
import { makeDroneModel } from '../src/models'
import { droneMarkerSize } from '../src/visuals'

describe('C-04 drone models', () => {
  it.each(SEED_DRONES.map((s) => [s.id, s] as const))('%s builds an animated model', (_id, spec) => {
    const model = makeDroneModel(spec, true)
    let meshCount = 0
    model.root.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) meshCount++
    })
    // A real silhouette, not a single marker primitive.
    expect(meshCount).toBeGreaterThanOrEqual(8)
    expect(model.spinners.length).toBeGreaterThanOrEqual(1)
  })

  it('rotors actually spin when animated', () => {
    const spec = SEED_DRONES.find((s) => s.id === 'mavic3')!
    const model = makeDroneModel(spec, true)
    const before = model.spinners.map((s) => s.node.rotation.y)
    model.animate(0.016, 1, { moving: false, uncontrolled: false })
    model.spinners.forEach((s, i) => expect(s.node.rotation.y).not.toBe(before[i]))
  })

  it('multirotors pitch into forward flight, winged types do not bob', () => {
    const quad = makeDroneModel(SEED_DRONES.find((s) => s.id === 'fpv-strike')!, true)
    expect(quad.hovers).toBe(true)
    for (let i = 0; i < 60; i++) quad.animate(0.016, i * 0.016, { moving: true, uncontrolled: false })
    expect(quad.airframe.rotation.z).toBeGreaterThan(0.1)

    const wing = makeDroneModel(SEED_DRONES.find((s) => s.id === 'tb2')!, true)
    expect(wing.hovers).toBe(false)
  })

  it('loss of control flutters the airframe', () => {
    const model = makeDroneModel(SEED_DRONES.find((s) => s.id === 'mavic3')!, true)
    model.animate(0.016, 0.13, { moving: false, uncontrolled: true })
    expect(Math.abs(model.airframe.rotation.x) + Math.abs(model.airframe.rotation.z)).toBeGreaterThan(0.01)
  })

  it('model footprint is close to the class marker size', () => {
    for (const spec of SEED_DRONES) {
      const model = makeDroneModel(spec, false)
      model.root.updateMatrixWorld(true)
      const size = new Box3().setFromObject(model.root).getSize(new Vector3())
      const marker = droneMarkerSize(spec.class)
      const span = Math.max(size.x, size.z)
      expect(span).toBeGreaterThan(marker * 0.6)
      expect(span).toBeLessThan(marker * 2.2)
    }
  })
})
