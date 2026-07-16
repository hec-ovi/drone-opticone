import { describe, expect, it } from 'vitest'
import {
  Bus,
  type ClientTopics,
  type DroneState,
  type IssuedCommand,
  type PlayerView,
  type ScenePort,
  type SceneInteractionMode,
} from '@opticone/shared'
import { GameShell, HUMAN, OVERLORD } from '../src/shell'

/** Test double for C-04: records everything the shell pushes at it. */
class FakeScene implements ScenePort {
  views: PlayerView[] = []
  mode: SceneInteractionMode = 'normal'
  private commandCb: (cmd: IssuedCommand) => void = () => {}
  applyView(view: PlayerView): void {
    this.views.push(view)
  }
  onCommand(cb: (cmd: IssuedCommand) => void): void {
    this.commandCb = cb
  }
  onSelection(_cb: (drones: DroneState[]) => void): void {}
  setInteractionMode(mode: SceneInteractionMode): void {
    this.mode = mode
  }
  dispose(): void {}
  userIssues(cmd: IssuedCommand): void {
    this.commandCb(cmd)
  }
}

function rig() {
  const bus = new Bus<ClientTopics>()
  const scene = new FakeScene()
  const shell = new GameShell(bus, scene, 42, 'normal')
  return { bus, scene, shell }
}

describe('app shell integration (real sim, fake scene)', () => {
  it('each step advances the match and publishes the fog-filtered human view', () => {
    const { bus, scene, shell } = rig()
    const views: PlayerView[] = []
    bus.on('view', (v) => views.push(v))

    shell.step()
    shell.step()

    expect(shell.state.tick).toBe(2)
    expect(views.length).toBe(2)
    expect(views[1]!.playerId).toBe(HUMAN)
    expect(scene.views.length).toBe(2)
    // Fog: the overlord base is out of sight at match start.
    expect(views[1]!.structures.every((s) => s.playerId === HUMAN)).toBe(true)
  })

  it('a build intent from the UI turns into a spawned drone', () => {
    const { bus, shell } = rig()
    const before = shell.state.drones.filter((d) => d.playerId === HUMAN).length
    bus.emit('intent:build', { specId: 'fpv-strike' })
    for (let t = 0; t < 6 * 20; t++) shell.step()
    const after = shell.state.drones.filter((d) => d.playerId === HUMAN && d.specId === 'fpv-strike')
    expect(after.length).toBeGreaterThanOrEqual(1)
    expect(shell.state.drones.filter((d) => d.playerId === HUMAN).length).toBeGreaterThan(before)
  })

  it('sweep mode round-trip: UI intent arms the scene, a sweep command disarms it', () => {
    const { bus, scene, shell } = rig()
    const changes: boolean[] = []
    bus.on('sweepModeChanged', (on) => changes.push(on))

    bus.emit('intent:sweepMode', true)
    expect(scene.mode).toBe('sweep')

    scene.userIssues({ type: 'satelliteSweep', playerId: HUMAN, center: { x: 3500, z: 3500 } })
    expect(scene.mode).toBe('normal')
    expect(changes).toEqual([false])

    shell.step()
    expect(shell.state.players.find((p) => p.id === HUMAN)!.satellite.energy).toBeLessThan(100)
  })

  it('scene commands reach the sim: a move order changes the drone mode', () => {
    const { scene, shell } = rig()
    const scout = shell.state.drones.find((d) => d.playerId === HUMAN && d.specId === 'mavic3')!
    scene.userIssues({ type: 'move', playerId: HUMAN, droneIds: [scout.id], to: { x: 2000, y: 0, z: 2000 } })
    shell.step()
    expect(shell.state.drones.find((d) => d.id === scout.id)!.mode).toBe('moving')
  })

  it('the overlord actually plays: it queues builds within the first simulated minute', () => {
    const { shell } = rig()
    let botActed = false
    for (let t = 0; t < 60 * 20 && !botActed; t++) {
      shell.step()
      botActed =
        shell.state.builds.some((b) => b.playerId === OVERLORD) ||
        shell.state.drones.filter((d) => d.playerId === OVERLORD).length > 2
    }
    expect(botActed).toBe(true)
  })

  it('restart intent resets the match', () => {
    const { bus, shell } = rig()
    for (let t = 0; t < 10; t++) shell.step()
    expect(shell.state.tick).toBe(10)
    bus.emit('intent:restart', null)
    expect(shell.state.tick).toBe(0)
  })
})
