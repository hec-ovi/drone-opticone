import {
  Bus,
  type ClientTopics,
  type IssuedCommand,
  type MatchState,
  type ScenePort,
} from '@opticone/shared'
import { createMatch, snapshot, tick } from '@opticone/sim-core'
import { getCatalog } from '@opticone/registry'
import { evaluatePolicies, overlordAct, type Difficulty } from '@opticone/agents'

export const HUMAN = 'human'
export const OVERLORD = 'overlord'

/**
 * App shell: the composition root. Owns the match loop and the wiring
 * between sim (C-03), scene (C-04), UI (C-05) and agents (C-07). It has no
 * logic of its own beyond routing messages.
 */
export class GameShell {
  state: MatchState
  private queued: IssuedCommand[] = []
  private offs: (() => void)[] = []

  constructor(
    private bus: Bus<ClientTopics>,
    private scene: ScenePort,
    seed: number,
    private difficulty: Difficulty = 'normal',
  ) {
    this.state = createMatch(seed, 'map-1', [HUMAN, OVERLORD], getCatalog())

    this.scene.onCommand((cmd) => {
      this.queued.push(cmd)
      if (cmd.type === 'satelliteSweep') {
        this.scene.setInteractionMode('normal')
        this.bus.emit('sweepModeChanged', false)
      }
    })
    this.scene.onSelection((drones) => this.bus.emit('selection', drones))

    this.offs.push(
      this.bus.on('intent:build', ({ specId }) => {
        const factory = this.state.structures.find((s) => s.playerId === HUMAN && s.kind === 'factory')
        if (factory) this.queued.push({ type: 'build', playerId: HUMAN, structureId: factory.id, specId })
      }),
      this.bus.on('intent:sweepMode', (on) => this.scene.setInteractionMode(on ? 'sweep' : 'normal')),
      this.bus.on('intent:restart', () => this.restart((this.state.tick + 1) * 7919)),
    )
  }

  restart(seed: number): void {
    this.state = createMatch(seed, 'map-1', [HUMAN, OVERLORD], getCatalog())
    this.queued = []
  }

  /** One fixed 50 ms step: gather commands from every box, tick, publish. */
  step(): void {
    const humanView = snapshot(this.state, HUMAN)
    const botView = snapshot(this.state, OVERLORD)
    const commands: IssuedCommand[] = [
      ...this.queued,
      ...evaluatePolicies(humanView),
      ...overlordAct(botView, this.difficulty),
      ...evaluatePolicies(botView),
    ]
    this.queued = []

    const result = tick(this.state, commands)
    this.state = result.state

    const nextView = snapshot(this.state, HUMAN)
    this.scene.applyView(nextView)
    this.bus.emit('view', nextView)
    // Only the human player's own events reach the UI; anything else would
    // leak intel through the fog (enemy losses, enemy resource flows).
    const visible = result.events.filter(
      (e) => e.type === 'matchEnded' || ('playerId' in e && e.playerId === HUMAN),
    )
    if (visible.length > 0) this.bus.emit('events', visible)
  }

  dispose(): void {
    this.offs.forEach((off) => off())
  }
}
