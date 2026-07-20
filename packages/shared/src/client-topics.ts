import type {
  DroneState,
  IssuedCommand,
  PlayerView,
  PolicySpec,
  ResourceNodeState,
  SimEvent,
  StructureState,
} from './types'

/** What the player currently has selected: units, own buildings, or a node. */
export interface Selection {
  drones: DroneState[]
  structures: StructureState[]
  nodes: ResourceNodeState[]
}

export const EMPTY_SELECTION: Selection = { drones: [], structures: [], nodes: [] }

/**
 * Client-side bus topics. The app shell owns the wiring; scene (C-04),
 * UI (C-05) and telemetry (C-06) only ever see these messages.
 */
export interface ClientTopics extends Record<string, unknown> {
  view: PlayerView
  events: SimEvent[]
  selection: Selection
  cameraPose: CameraPose
  thumbnails: ThumbnailSet
  'intent:build': { specId: string }
  'intent:sweepMode': boolean
  'intent:restart': null
  'intent:focus': { x: number; z: number }
  'intent:policy': PolicySpec | null
  'intent:selfDestruct': null
  'intent:stop': null
  'intent:mineNearest': null
  'intent:startMatch': { seed: number; difficulty: 'easy' | 'normal' | 'hard' }
  'intent:openMenu': null
  'intent:mute': boolean
  sweepModeChanged: boolean
}

export type SceneInteractionMode = 'normal' | 'sweep'

/**
 * Rendered model thumbnails (data URLs) keyed by spec id, structure kind and
 * node kind. Produced by C-04 at boot, consumed by C-05 for cards, portraits
 * and chips; empty maps headless.
 */
export interface ThumbnailSet {
  drones: Record<string, string>
  structures: Record<string, string>
  nodes: Record<string, string>
}

/** Where the RTS camera is looking, published for the minimap. */
export interface CameraPose {
  x: number
  z: number
  yaw: number
  dist: number
}

/** C-04 public surface as seen by the app shell. */
export interface ScenePort {
  applyView(view: PlayerView): void
  onCommand(cb: (cmd: IssuedCommand) => void): void
  onSelection(cb: (selection: Selection) => void): void
  onCameraPose(cb: (pose: CameraPose) => void): void
  focusAt(x: number, z: number): void
  setInteractionMode(mode: SceneInteractionMode): void
  dispose(): void
}
