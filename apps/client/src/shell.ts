import {
  Bus,
  EMPTY_SELECTION,
  type ClientTopics,
  type IssuedCommand,
  type MatchState,
  type ScenePort,
  type Selection,
  type SimEvent,
} from '@opticone/shared'
import { createMatch, snapshot, tick } from '@opticone/sim-core'
import { getCatalog } from '@opticone/registry'
import { evaluatePolicies, overlordAct, type Difficulty } from '@opticone/agents'
import type { SoundEngine } from './sound'

export const HUMAN = 'human'
export const OVERLORD = 'overlord'

/**
 * App shell: the composition root. Owns the match loop and the wiring
 * between sim (C-03), scene (C-04), UI (C-05) and agents (C-07). It has no
 * logic of its own beyond routing messages.
 */
export class GameShell {
  state: MatchState
  running = false
  private difficulty: Difficulty
  private queued: IssuedCommand[] = []
  private selection: Selection = EMPTY_SELECTION
  private offs: (() => void)[] = []

  constructor(
    private bus: Bus<ClientTopics>,
    private scene: ScenePort,
    seed: number,
    difficulty: Difficulty = 'normal',
    private sound?: SoundEngine,
  ) {
    this.difficulty = difficulty
    this.state = createMatch(seed, 'map-1', [HUMAN, OVERLORD], getCatalog())

    this.scene.onCommand((cmd) => {
      this.queued.push(cmd)
      this.sound?.play(cmd.type === 'satelliteSweep' ? 'sweep' : cmd.type === 'construct' ? 'build' : 'click')
      if (cmd.type === 'satelliteSweep') {
        this.scene.setInteractionMode('normal')
        this.bus.emit('sweepModeChanged', false)
      }
      if (cmd.type === 'construct') {
        this.scene.setInteractionMode('normal')
        this.bus.emit('placeModeChanged', null)
      }
    })
    // The scene can drop out of sweep/placement itself (Esc, right-click);
    // mirror that into the bus so armed buttons and hints reset.
    this.scene.onModeChange((mode) => {
      if (mode === 'normal') {
        this.bus.emit('sweepModeChanged', false)
        this.bus.emit('placeModeChanged', null)
      }
    })
    this.scene.onSelection((selection) => {
      this.selection = selection
      this.bus.emit('selection', selection)
    })
    this.scene.onCameraPose((pose) => this.bus.emit('cameraPose', pose))

    this.offs.push(
      this.bus.on('intent:build', ({ specId }) => {
        // Route to the selected factory so multi-factory bases queue where
        // the player is looking; fall back to the first own factory.
        const selected = this.selection.structures.find((s) => s.playerId === HUMAN && s.kind === 'factory')
        const factory =
          selected ?? this.state.structures.find((s) => s.playerId === HUMAN && s.kind === 'factory')
        if (factory) {
          this.queued.push({ type: 'build', playerId: HUMAN, structureId: factory.id, specId })
          this.sound?.play('build')
        }
      }),
      this.bus.on('intent:construct', ({ kind }) => {
        this.scene.setInteractionMode(`place:${kind}`)
        this.bus.emit('placeModeChanged', kind)
        this.bus.emit('sweepModeChanged', false)
        this.sound?.play('click')
      }),
      this.bus.on('intent:sweepMode', (on) => {
        this.scene.setInteractionMode(on ? 'sweep' : 'normal')
        this.bus.emit('sweepModeChanged', on)
        if (on) this.bus.emit('placeModeChanged', null)
      }),
      this.bus.on('intent:restart', () => this.startMatch((this.state.tick + 1) * 7919, this.difficulty)),
      this.bus.on('intent:startMatch', ({ seed: s, difficulty: d }) => this.startMatch(s, d)),
      this.bus.on('intent:focus', ({ x, z }) => this.scene.focusAt(x, z)),
      this.bus.on('intent:policy', (policy) => {
        const ids = this.ownSelectedIds()
        if (ids.length === 0) return
        this.queued.push({ type: 'assignPolicy', playerId: HUMAN, droneIds: ids, policy })
        this.sound?.play('click')
      }),
      this.bus.on('intent:selfDestruct', () => {
        const ids = this.ownSelectedIds()
        if (ids.length === 0) return
        this.queued.push({ type: 'selfDestruct', playerId: HUMAN, droneIds: ids })
      }),
      this.bus.on('intent:stop', () => {
        // Stop = fly to where you already are; the sim has no idle command.
        for (const d of this.selection.drones.filter((dr) => dr.playerId === HUMAN)) {
          this.queued.push({ type: 'move', playerId: HUMAN, droneIds: [d.id], to: { ...d.pos } })
        }
        this.sound?.play('click')
      }),
      this.bus.on('intent:mineNearest', () => {
        const view = snapshot(this.state, HUMAN)
        const miners = this.selection.drones.filter(
          (d) =>
            d.playerId === HUMAN && ['mining', 'cargo'].includes(view.catalog[d.specId]?.class ?? ''),
        )
        for (const m of miners) {
          let best: (typeof view.nodes)[number] | undefined
          let bestD = Infinity
          for (const n of view.nodes) {
            const dd = Math.hypot(n.pos.x - m.pos.x, n.pos.z - m.pos.z)
            if (dd < bestD) {
              bestD = dd
              best = n
            }
          }
          if (best) this.queued.push({ type: 'mine', playerId: HUMAN, droneIds: [m.id], nodeId: best.id })
        }
        this.sound?.play('click')
      }),
      this.bus.on('intent:mute', (muted) => {
        if (this.sound) this.sound.muted = muted
      }),
    )
  }

  private ownSelectedIds(): string[] {
    return this.selection.drones.filter((d) => d.playerId === HUMAN).map((d) => d.id)
  }

  startMatch(seed: number, difficulty: Difficulty): void {
    this.difficulty = difficulty
    this.state = createMatch(seed, 'map-1', [HUMAN, OVERLORD], getCatalog())
    this.queued = []
    this.selection = EMPTY_SELECTION
    this.running = true
    this.bus.emit('selection', EMPTY_SELECTION)
  }

  /** Kept for compatibility with older callers and tests. */
  restart(seed: number): void {
    this.startMatch(seed, this.difficulty)
  }

  /** Push the current view without ticking, e.g. as the menu backdrop. */
  publishView(): void {
    const view = snapshot(this.state, HUMAN)
    this.scene.applyView(view)
    this.bus.emit('view', view)
  }

  private playEventSounds(events: SimEvent[]): void {
    if (!this.sound) return
    for (const e of events) {
      if (e.type === 'matchEnded') this.sound.play(e.winner === HUMAN ? 'victory' : 'defeat')
      else if (e.type === 'destroyed') this.sound.play('explosion')
      else if (e.type === 'batteryLow') this.sound.play('alert')
      else if (e.type === 'spawned') this.sound.play('spawn')
    }
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
    if (visible.length > 0) {
      this.bus.emit('events', visible)
      this.playEventSounds(visible)
    }
    if (this.state.winner) this.running = false
  }

  dispose(): void {
    this.offs.forEach((off) => off())
  }
}
