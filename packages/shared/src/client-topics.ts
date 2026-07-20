import type { DroneState, IssuedCommand, PlayerView, PolicySpec, SimEvent } from './types'

/**
 * Client-side bus topics. The app shell owns the wiring; scene (C-04),
 * UI (C-05) and telemetry (C-06) only ever see these messages.
 */
export interface ClientTopics extends Record<string, unknown> {
  view: PlayerView
  events: SimEvent[]
  selection: DroneState[]
  cameraPose: CameraPose
  'intent:build': { specId: string }
  'intent:sweepMode': boolean
  'intent:restart': null
  'intent:focus': { x: number; z: number }
  'intent:policy': PolicySpec | null
  'intent:selfDestruct': null
  'intent:startMatch': { seed: number; difficulty: 'easy' | 'normal' | 'hard' }
  'intent:openMenu': null
  'intent:mute': boolean
  sweepModeChanged: boolean
}

export type SceneInteractionMode = 'normal' | 'sweep'

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
  onSelection(cb: (drones: DroneState[]) => void): void
  onCameraPose(cb: (pose: CameraPose) => void): void
  focusAt(x: number, z: number): void
  setInteractionMode(mode: SceneInteractionMode): void
  dispose(): void
}
