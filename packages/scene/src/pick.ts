import { Vector3, type PerspectiveCamera } from 'three/webgpu'
import { canAttack, canMine, type PlayerView, type Vec3 } from '@opticone/shared'

/**
 * Pure picking math (no raycasting against meshes, so it stays testable
 * headless): intersect the camera ray through an NDC point with the ground
 * plane y = 0.
 */
export function ndcToGround(camera: PerspectiveCamera, ndcX: number, ndcY: number): Vec3 | null {
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld)
  const target = new Vector3(ndcX, ndcY, 0.5).unproject(camera)
  const dir = target.sub(origin).normalize()
  if (Math.abs(dir.y) < 1e-6) return null
  const t = -origin.y / dir.y
  if (t <= 0) return null
  return { x: origin.x + dir.x * t, y: 0, z: origin.z + dir.z * t }
}

export interface Pickable {
  id: string
  pos: Vec3
}

/** Nearest entity to a ground point within maxDist (2D). */
export function nearestPickable<T extends Pickable>(point: Vec3, items: T[], maxDist: number): T | undefined {
  let best: T | undefined
  let bestD = maxDist
  for (const item of items) {
    const d = Math.hypot(item.pos.x - point.x, item.pos.z - point.z)
    if (d <= bestD) {
      bestD = d
      best = item
    }
  }
  return best
}

export interface PickTarget {
  kind: 'ownDrone' | 'ownStructure' | 'enemy' | 'node' | 'ground'
  id: string | null
  point: Vec3
}

/** Structures and nodes are physically larger than the drone tolerance. */
const BUILDING_PICK_M = 90

/** Classify what a ground point refers to, in RTS priority order. */
export function classifyPick(view: PlayerView, point: Vec3, tolerance: number): PickTarget {
  const own = nearestPickable(point, view.ownDrones, tolerance)
  if (own) return { kind: 'ownDrone', id: own.id, point }
  const enemy = nearestPickable(
    point,
    [...view.enemyDrones, ...view.structures.filter((s) => s.playerId !== view.playerId)],
    tolerance,
  )
  if (enemy) return { kind: 'enemy', id: enemy.id, point }
  const ownStructure = nearestPickable(
    point,
    view.structures.filter((s) => s.playerId === view.playerId),
    Math.max(tolerance, BUILDING_PICK_M),
  )
  if (ownStructure) return { kind: 'ownStructure', id: ownStructure.id, point }
  const node = nearestPickable(point, view.nodes, Math.max(tolerance, BUILDING_PICK_M))
  if (node) return { kind: 'node', id: node.id, point }
  return { kind: 'ground', id: null, point }
}

export type HoverVerb = 'attack' | 'mine' | 'move' | 'invalid' | 'none'

export interface HoverState {
  verb: HoverVerb
  targetId: string | null
  targetKind: PickTarget['kind']
}

/**
 * What a right-click would do at this point given the current selection:
 * 'attack' / 'mine' when a selected unit can actually take the order,
 * 'invalid' when hovering a target none of the selection can act on,
 * 'move' for plain ground, 'none' when nothing orderable is selected.
 */
export function hoverIntent(
  view: PlayerView,
  selectedIds: ReadonlySet<string>,
  point: Vec3,
  tolerance: number,
): HoverState {
  const own = view.ownDrones.filter((d) => selectedIds.has(d.id))
  if (own.length === 0) return { verb: 'none', targetId: null, targetKind: 'ground' }
  const target = classifyPick(view, point, tolerance)
  const anySpec = (test: (spec: NonNullable<PlayerView['catalog'][string]>) => boolean) =>
    own.some((d) => {
      const spec = view.catalog[d.specId]
      return spec !== undefined && test(spec)
    })
  if (target.kind === 'enemy' && target.id) {
    return { verb: anySpec(canAttack) ? 'attack' : 'invalid', targetId: target.id, targetKind: target.kind }
  }
  if (target.kind === 'node' && target.id) {
    return { verb: anySpec(canMine) ? 'mine' : 'invalid', targetId: target.id, targetKind: target.kind }
  }
  return { verb: 'move', targetId: target.id, targetKind: target.kind }
}
