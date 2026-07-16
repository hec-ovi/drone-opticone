/**
 * RTS camera rig: orbiting focus point on the ground. Pure math, fully
 * testable headless; scene.ts only feeds it input and reads the pose.
 */
export interface CameraPose {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
}

export const CAM = {
  minDist: 300,
  maxDist: 6500,
  minPitch: 0.35, // rad above the horizon
  maxPitch: 1.35,
  panSpeed: 1.9, // map-units per second per unit of camDist... scaled below
  edgePx: 26,
  rotatePerPx: 0.006,
  pitchPerPx: 0.004,
}

export class CameraRig {
  focus = { x: 0, z: 0 }
  dist = 1600
  yaw = 0
  pitch = 0.9

  constructor(private mapSize: number) {}

  setMapSize(size: number): void {
    this.mapSize = size
  }

  /** Ground-plane forward vector (where "up on the screen" points). */
  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }
  }

  right(): { x: number; z: number } {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }
  }

  /** Move the focus in camera-relative screen directions. dx,dy in [-1,1]. */
  pan(dx: number, dy: number, dt: number): void {
    const speed = this.dist * CAM.panSpeed * dt
    const f = this.forward()
    const r = this.right()
    this.focus.x += (r.x * dx + f.x * -dy) * speed
    this.focus.z += (r.z * dx + f.z * -dy) * speed
    this.focus.x = Math.max(0, Math.min(this.mapSize, this.focus.x))
    this.focus.z = Math.max(0, Math.min(this.mapSize, this.focus.z))
  }

  /** Keyboard pan from a set of pressed key codes. */
  panFromKeys(keys: ReadonlySet<string>, dt: number): void {
    let dx = 0
    let dy = 0
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1
    if (dx !== 0 || dy !== 0) this.pan(dx, dy, dt)
  }

  /** Classic RTS edge pan: pointer near a viewport edge pushes the map. */
  panFromEdge(px: number, py: number, width: number, height: number, dt: number): void {
    let dx = 0
    let dy = 0
    if (px >= 0 && px <= CAM.edgePx) dx = -1
    else if (px >= width - CAM.edgePx && px <= width) dx = 1
    if (py >= 0 && py <= CAM.edgePx) dy = -1
    else if (py >= height - CAM.edgePx && py <= height) dy = 1
    if (dx !== 0 || dy !== 0) this.pan(dx, dy, dt)
  }

  /**
   * Grab-pan (hold left+right): the ground point under the cursor follows
   * the cursor. Pixel deltas are converted with a zoom-scaled factor.
   */
  dragPan(dxPx: number, dyPx: number): void {
    const k = this.dist * 0.0016
    const f = this.forward()
    const r = this.right()
    this.focus.x -= (r.x * dxPx - f.x * dyPx) * k
    this.focus.z -= (r.z * dxPx - f.z * dyPx) * k
    this.focus.x = Math.max(0, Math.min(this.mapSize, this.focus.x))
    this.focus.z = Math.max(0, Math.min(this.mapSize, this.focus.z))
  }

  /** Middle-mouse orbit: horizontal drag spins the map, vertical tilts it. */
  rotate(dxPx: number, dyPx: number): void {
    this.yaw = (this.yaw - dxPx * CAM.rotatePerPx) % (Math.PI * 2)
    this.pitch = Math.max(CAM.minPitch, Math.min(CAM.maxPitch, this.pitch + dyPx * CAM.pitchPerPx))
  }

  zoom(deltaY: number): void {
    this.dist = Math.max(CAM.minDist, Math.min(CAM.maxDist, this.dist * (deltaY > 0 ? 1.12 : 0.89)))
  }

  pose(): CameraPose {
    const h = this.dist * Math.cos(this.pitch)
    return {
      position: {
        x: this.focus.x + Math.sin(this.yaw) * h,
        y: this.dist * Math.sin(this.pitch),
        z: this.focus.z + Math.cos(this.yaw) * h,
      },
      target: { x: this.focus.x, y: 0, z: this.focus.z },
    }
  }
}
