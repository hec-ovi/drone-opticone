import type { DroneState, IssuedCommand, PlayerView, SimEvent } from './types'

/**
 * Client-side bus topics. The app shell owns the wiring; scene (C-04),
 * UI (C-05) and telemetry (C-06) only ever see these messages.
 */
export interface ClientTopics extends Record<string, unknown> {
  view: PlayerView
  events: SimEvent[]
  selection: DroneState[]
  'intent:build': { specId: string }
  'intent:sweepMode': boolean
  'intent:restart': null
  sweepModeChanged: boolean
}

export type SceneInteractionMode = 'normal' | 'sweep'

/** C-04 public surface as seen by the app shell. */
export interface ScenePort {
  applyView(view: PlayerView): void
  onCommand(cb: (cmd: IssuedCommand) => void): void
  onSelection(cb: (drones: DroneState[]) => void): void
  setInteractionMode(mode: SceneInteractionMode): void
  dispose(): void
}
