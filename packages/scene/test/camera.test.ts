import { describe, expect, it } from 'vitest'
import { CAM, CameraRig } from '@opticone/scene'

function rig(): CameraRig {
  const r = new CameraRig(4000)
  r.focus.x = 2000
  r.focus.z = 2000
  return r
}

describe('C-04 camera rig', () => {
  it('W pans forward (screen up) and the direction follows the yaw', () => {
    const r = rig()
    r.panFromKeys(new Set(['KeyW']), 0.1)
    expect(r.focus.z).toBeLessThan(2000)
    expect(r.focus.x).toBeCloseTo(2000, 5)

    // Rotate the map half a turn: W now goes the other way.
    const r2 = rig()
    r2.yaw = Math.PI
    r2.panFromKeys(new Set(['KeyW']), 0.1)
    expect(r2.focus.z).toBeGreaterThan(2000)
  })

  it('edge pan pushes toward the hovered edge and does nothing mid-screen', () => {
    const r = rig()
    r.panFromEdge(5, 400, 1280, 800, 0.1)
    expect(r.focus.x).toBeLessThan(2000)

    const still = rig()
    still.panFromEdge(640, 400, 1280, 800, 0.1)
    expect(still.focus).toEqual({ x: 2000, z: 2000 })
  })

  it('pan speed scales with zoom distance', () => {
    const near = rig()
    near.dist = 500
    near.panFromKeys(new Set(['KeyD']), 0.1)
    const far = rig()
    far.dist = 4000
    far.panFromKeys(new Set(['KeyD']), 0.1)
    expect(far.focus.x - 2000).toBeGreaterThan((near.focus.x - 2000) * 5)
  })

  it('panning clamps to the map bounds', () => {
    const r = rig()
    for (let i = 0; i < 100; i++) r.panFromKeys(new Set(['KeyA']), 0.5)
    expect(r.focus.x).toBe(0)
  })

  it('middle-drag rotates yaw and clamps pitch', () => {
    const r = rig()
    const yaw0 = r.yaw
    r.rotate(120, 0)
    expect(r.yaw).not.toBe(yaw0)

    for (let i = 0; i < 200; i++) r.rotate(0, 500)
    expect(r.pitch).toBe(CAM.maxPitch)
    for (let i = 0; i < 200; i++) r.rotate(0, -500)
    expect(r.pitch).toBe(CAM.minPitch)
  })

  it('zoom clamps and the pose keeps the camera at the configured distance', () => {
    const r = rig()
    for (let i = 0; i < 100; i++) r.zoom(-1)
    expect(r.dist).toBe(CAM.minDist)
    for (let i = 0; i < 100; i++) r.zoom(1)
    expect(r.dist).toBe(CAM.maxDist)

    r.dist = 1000
    r.yaw = 0.7
    const pose = r.pose()
    const dx = pose.position.x - pose.target.x
    const dy = pose.position.y - pose.target.y
    const dz = pose.position.z - pose.target.z
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(1000, 5)
    expect(pose.target).toEqual({ x: 2000, y: 0, z: 2000 })
  })

  it('the camera always looks at the focus from above the ground', () => {
    const r = rig()
    r.rotate(300, -300)
    const pose = r.pose()
    expect(pose.position.y).toBeGreaterThan(0)
  })
})
