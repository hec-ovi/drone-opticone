import type { Vec3 } from '@opticone/shared'

export function dist2D(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.hypot(dx, dz)
}

export function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Advance pos toward dest by step meters (3D). Returns true when arrived. */
export function stepToward(pos: Vec3, dest: Vec3, step: number, arriveDist: number): boolean {
  const d = dist3D(pos, dest)
  if (d <= arriveDist) return true
  const f = Math.min(1, step / d)
  pos.x += (dest.x - pos.x) * f
  pos.y += (dest.y - pos.y) * f
  pos.z += (dest.z - pos.z) * f
  return dist3D(pos, dest) <= arriveDist
}
