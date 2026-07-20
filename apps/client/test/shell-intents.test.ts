import { describe, expect, it } from 'vitest'
import {
  Bus,
  type ClientTopics,
  type DroneState,
  type IssuedCommand,
  type Selection,
  type PlayerView,
  type ScenePort,
  type SceneInteractionMode,
} from '@opticone/shared'
import { GameShell, HUMAN, OVERLORD } from '../src/shell'

class FakeScene implements ScenePort {
  views: PlayerView[] = []
  mode: SceneInteractionMode = 'normal'
  focused: { x: number; z: number } | null = null
  private commandCb: (cmd: IssuedCommand) => void = () => {}
  private selectionCb: (selection: Selection) => void = () => {}
  applyView(view: PlayerView): void {
    this.views.push(view)
  }
  onCommand(cb: (cmd: IssuedCommand) => void): void {
    this.commandCb = cb
  }
  onSelection(cb: (selection: Selection) => void): void {
    this.selectionCb = cb
  }
  onCameraPose(_cb: (pose: { x: number; z: number; yaw: number; dist: number }) => void): void {}
  focusAt(x: number, z: number): void {
    this.focused = { x, z }
  }
  setInteractionMode(mode: SceneInteractionMode): void {
    this.mode = mode
  }
  dispose(): void {}
  userIssues(cmd: IssuedCommand): void {
    this.commandCb(cmd)
  }
  userSelects(drones: DroneState[]): void {
    this.selectionCb({ drones, structures: [], nodes: [] })
  }
}

function rig() {
  const bus = new Bus<ClientTopics>()
  const scene = new FakeScene()
  const shell = new GameShell(bus, scene, 42, 'normal')
  return { bus, scene, shell }
}

describe('app shell: new intents', () => {
  it('a policy intent assigns the policy to the selected drones in the sim', () => {
    const { bus, scene, shell } = rig()
    const scout = shell.state.drones.find((d) => d.playerId === HUMAN && d.specId === 'mavic3')!
    scene.userSelects([scout])
    bus.emit('intent:policy', { kind: 'returnAtBatteryPct', pct: 20 })
    shell.step()
    const after = shell.state.drones.find((d) => d.id === scout.id)!
    expect(after.policy).toEqual({ kind: 'returnAtBatteryPct', pct: 20 })

    bus.emit('intent:policy', null)
    shell.step()
    expect(shell.state.drones.find((d) => d.id === scout.id)!.policy).toBeNull()
  })

  it('policy intents with no selection are ignored', () => {
    const { bus, shell } = rig()
    bus.emit('intent:policy', { kind: 'kamikazeOn', radiusM: 600 })
    shell.step()
    // Only human drones matter here; the overlord assigns its own policies.
    expect(shell.state.drones.filter((d) => d.playerId === HUMAN).every((d) => d.policy === null)).toBe(true)
  })

  it('self-destruct removes the selected drone', () => {
    const { bus, scene, shell } = rig()
    const scout = shell.state.drones.find((d) => d.playerId === HUMAN && d.specId === 'mavic3')!
    scene.userSelects([scout])
    bus.emit('intent:selfDestruct', null)
    shell.step()
    expect(shell.state.drones.find((d) => d.id === scout.id)).toBeUndefined()
  })

  it('minimap focus intents reach the scene camera', () => {
    const { bus, scene } = rig()
    bus.emit('intent:focus', { x: 1234, z: 987 })
    expect(scene.focused).toEqual({ x: 1234, z: 987 })
  })

  it('startMatch resets state, applies the difficulty and starts the loop', () => {
    const { bus, shell } = rig()
    expect(shell.running).toBe(false)
    for (let i = 0; i < 5; i++) shell.step()
    bus.emit('intent:startMatch', { seed: 7, difficulty: 'hard' })
    expect(shell.running).toBe(true)
    expect(shell.state.tick).toBe(0)
  })

  it('the loop flag drops when the match ends', () => {
    const { bus, shell } = rig()
    bus.emit('intent:startMatch', { seed: 7, difficulty: 'hard' })
    // Force a win: remove the overlord base.
    shell.state.structures = shell.state.structures.filter(
      (s) => !(s.playerId === OVERLORD && s.kind === 'centcomm'),
    )
    shell.step()
    expect(shell.state.winner).toBe(HUMAN)
    expect(shell.running).toBe(false)
  })
})

describe('app shell: end to end', () => {
  it('a hard overlord wins a full match against an idle human through the shell', () => {
    const bus = new Bus<ClientTopics>()
    const scene = new FakeScene()
    const shell = new GameShell(bus, scene, 7, 'hard')
    bus.emit('intent:startMatch', { seed: 7, difficulty: 'hard' })
    let winners: string[] = []
    bus.on('events', (events) => {
      winners = winners.concat(
        events.flatMap((e) => (e.type === 'matchEnded' ? [e.winner] : [])),
      )
    })
    const MAX = 40000
    let steps = 0
    while (shell.running && steps++ < MAX) shell.step()
    expect(shell.state.winner).toBe(OVERLORD)
    expect(winners).toEqual([OVERLORD])
    // The final published view carries the verdict for the banner.
    expect(scene.views.at(-1)!.winner).toBe(OVERLORD)
  }, 240000)
})
