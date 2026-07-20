import type { DroneClass, StructureKind } from '@opticone/shared'

/**
 * Marker visuals. Physics and positions are 1:1; these sizes are the map
 * markers a commander sees, since a 0.35 m quad is invisible on a 4 km map.
 */
export function droneMarkerSize(cls: DroneClass): number {
  switch (cls) {
    case 'multirotor':
      return 10
    case 'mining':
    case 'cargo':
      return 16
    case 'loitering-munition':
      return 14
    case 'fixed-wing':
      return 26
  }
}

export function droneColor(own: boolean, cls: DroneClass): number {
  if (!own) return 0xff5252
  switch (cls) {
    case 'mining':
    case 'cargo':
      return 0x7ddf7d
    default:
      return 0x4da6ff
  }
}

export function structureColor(kind: StructureKind, own: boolean): number {
  if (!own) return 0xb03030
  switch (kind) {
    case 'centcomm':
      return 0xf2d16b
    case 'refinery':
      return 0x9a7bd6
    case 'factory':
      return 0x6bb8f2
    case 'relay':
      return 0xcccccc
    case 'satellite-uplink':
      return 0x6bf2c8
    case 'power-plant':
      return 0x8de26b
    case 'air-defense':
      return 0xf28f6b
  }
}

export function nodeColor(kind: 'lithium' | 'oil'): number {
  return kind === 'lithium' ? 0x7fffd4 : 0x2b2b2b
}
