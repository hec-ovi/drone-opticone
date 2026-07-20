import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { Bus, type ClientTopics, type PlayerView, type PolicySpec } from '@opticone/shared'
import { getCatalog, getDrone, SEED_DRONES } from '@opticone/registry'
import { createMatch, makeDrone, snapshot, tick } from '@opticone/sim-core'
import { mountUI, minimapToWorld, worldToMinimap, MINIMAP_SIZE, portraitSvg, droneRole } from '@opticone/ui'

function humanView(mutate?: (v: PlayerView) => void): PlayerView {
  const s = tick(
    createMatch(3, 'map-1', ['human', 'bot'], getCatalog(), { fixedWind: { dirRad: 0, speedMps: 4 } }),
    [],
  ).state
  const view = snapshot(s, 'human')
  mutate?.(view)
  return view
}

function selectFactory(bus: Bus<ClientTopics>, view: PlayerView): void {
  const factory = view.structures.find((st) => st.kind === 'factory' && st.playerId === 'human')!
  bus.emit('selection', { drones: [], structures: [factory], nodes: [] })
}

describe('C-05 minimap', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('pixel to world mapping round-trips', () => {
    const p = worldToMinimap(1000, 3000, MINIMAP_SIZE, 4000)
    const w = minimapToWorld(p.x, p.y, MINIMAP_SIZE, 4000)
    expect(w.x).toBeCloseTo(1000)
    expect(w.z).toBeCloseTo(3000)
  })

  it('clicking the minimap emits an intent:focus with world coordinates', async () => {
    const user = userEvent.setup()
    bus.emit('view', humanView())
    const focuses: { x: number; z: number }[] = []
    bus.on('intent:focus', (f) => focuses.push(f))
    await user.pointer({ keys: '[MouseLeft]', target: screen.getByRole('img', { name: 'minimap' }) })
    expect(focuses.length).toBe(1)
    expect(focuses[0]!.x).toBeGreaterThanOrEqual(0)
    expect(focuses[0]!.x).toBeLessThanOrEqual(4000)
  })

  it('right-clicking the minimap orders the selection there, without moving the camera', async () => {
    const user = userEvent.setup()
    bus.emit('view', humanView())
    const moves: { x: number; z: number }[] = []
    const focuses: { x: number; z: number }[] = []
    bus.on('intent:moveTo', (m) => moves.push(m))
    bus.on('intent:focus', (f) => focuses.push(f))
    await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('img', { name: 'minimap' }) })
    expect(moves.length).toBe(1)
    expect(moves[0]!.x).toBeGreaterThanOrEqual(0)
    expect(moves[0]!.x).toBeLessThanOrEqual(4000)
    expect(focuses.length).toBe(0)
  })

  it('the minimap is a pure map: no title, no status text, just the canvas', () => {
    bus.emit('view', humanView())
    bus.emit('sweepModeChanged', true)
    const panel = document.querySelector('.minimap-panel') as HTMLElement
    expect(panel.querySelector('h2')).toBeNull()
    expect(panel.querySelector('.sweep-state')).toBeNull()
    expect(panel.textContent).toBe('')
    expect(panel.querySelector('canvas')).not.toBeNull()
  })
})

describe('C-05 animated portraits', () => {
  it.each(SEED_DRONES.map((s) => [s.id, s] as const))('%s portrait has animated parts', (_id, spec) => {
    const svg = portraitSvg(spec)
    // Props spin or a jet plume burns; every portrait is alive.
    expect(svg.includes('p-rotor') || svg.includes('p-flame')).toBe(true)
    expect(svg).toContain('p-led') // blinking nav light
    expect(svg).toContain('p-bob') // hover bob wrapper
  })

  it('portraits are distinct art per airframe, not one shared sprite', () => {
    const byId = new Map(SEED_DRONES.map((s) => [s.id, portraitSvg(s)]))
    expect(byId.get('mavic3')).not.toBe(byId.get('fpv-strike'))
    expect(byId.get('tb2')).not.toBe(byId.get('shahed136'))
    // Winged portraits show airflow streaks, hover portraits do not.
    expect(byId.get('tb2')).toContain('p-stream')
    expect(byId.get('mavic3')).not.toContain('p-stream')
  })

  it('selecting a drone renders its portrait in the selection panel', () => {
    document.body.innerHTML = ''
    const bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
    const view = humanView()
    bus.emit('view', view)
    const scout = view.ownDrones.find((d) => d.specId === 'mavic3')!
    bus.emit('selection', { drones: [scout], structures: [], nodes: [] })
    const portrait = document.querySelector('.portrait') as HTMLElement
    expect(portrait).not.toBeNull()
    expect(portrait.dataset.spec).toBe('mavic3')
    expect(portrait.querySelector('.p-rotor')).not.toBeNull()
    expect(portrait.querySelector('.p-scan')).not.toBeNull()

    // Selection change swaps the portrait.
    const miner = view.ownDrones.find((d) => d.specId === 'ore-miner')!
    bus.emit('selection', { drones: [miner], structures: [], nodes: [] })
    expect((document.querySelector('.portrait') as HTMLElement).dataset.spec).toBe('ore-miner')
  })
})

describe('C-05 command card', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('the order grid is a fixed 3x3 card; slots light up per unit type', () => {
    bus.emit('view', humanView())
    expect(document.querySelectorAll('.order-slot').length).toBe(9)

    const stop = screen.getByRole('button', { name: 'Stop' })
    const kamikaze = screen.getByRole('button', { name: 'Kamikaze guard' })
    const mine = screen.getByRole('button', { name: 'Mine nearest node' })
    expect(stop).toBeDisabled()

    // A miner enables Stop and Mine, but never the warhead orders.
    const view = humanView()
    const miner = view.ownDrones.find((d) => d.specId === 'ore-miner')!
    bus.emit('selection', { drones: [miner], structures: [], nodes: [] })
    expect(stop).toBeEnabled()
    expect(mine).toBeEnabled()
    expect(kamikaze).toBeDisabled()

    // A strike quad enables the warhead orders instead.
    const fpv = makeDrone(getDrone('fpv-strike')!, 'human', { x: 700, y: 60, z: 700 }, 'fpv-x')
    bus.emit('selection', { drones: [fpv], structures: [], nodes: [] })
    expect(kamikaze).toBeEnabled()
    expect(mine).toBeDisabled()

    bus.emit('selection', { drones: [], structures: [], nodes: [] })
    expect(stop).toBeDisabled()
  })

  it('the card is per-unit: inapplicable actions hide their icons entirely', () => {
    const view = humanView()
    bus.emit('view', view)
    const miner = makeDrone(getDrone('ore-miner')!, 'human', { x: 600, y: 30, z: 600 }, 'miner-x')
    bus.emit('selection', { drones: [miner], structures: [], nodes: [] })
    expect(screen.getByRole('button', { name: 'Mine nearest node' }).classList.contains('off')).toBe(false)
    expect(screen.getByRole('button', { name: 'Kamikaze guard' }).classList.contains('off')).toBe(true)

    const fpv = makeDrone(getDrone('fpv-strike')!, 'human', { x: 700, y: 60, z: 700 }, 'fpv-x')
    bus.emit('selection', { drones: [fpv], structures: [], nodes: [] })
    expect(screen.getByRole('button', { name: 'Kamikaze guard' }).classList.contains('off')).toBe(false)
    expect(screen.getByRole('button', { name: 'Mine nearest node' }).classList.contains('off')).toBe(true)
  })

  it('Clear policy only appears once the selected drone actually has a policy', () => {
    const v0 = humanView()
    bus.emit('view', v0)
    const scout = v0.ownDrones.find((d) => d.specId === 'mavic3')!
    bus.emit('selection', { drones: [scout], structures: [], nodes: [] })
    const clear = () => screen.getByRole('button', { name: 'Clear policy' })
    expect(clear().classList.contains('off')).toBe(true)

    // The policy lands in the sim; the card follows on the next view.
    bus.emit(
      'view',
      humanView((v) => {
        v.ownDrones.find((d) => d.id === scout.id)!.policy = { kind: 'returnAtBatteryPct', pct: 20 }
      }),
    )
    expect(clear().classList.contains('off')).toBe(false)
    expect(clear()).toBeEnabled()
  })

  it('policy buttons publish typed policy intents', async () => {
    const user = userEvent.setup()
    bus.emit('view', humanView())
    const fpv = makeDrone(getDrone('fpv-strike')!, 'human', { x: 700, y: 60, z: 700 }, 'fpv-x')
    // Carries a standing order already, so Clear policy is on its card.
    fpv.policy = { kind: 'kamikazeOn', radiusM: 600 }
    bus.emit('selection', { drones: [fpv], structures: [], nodes: [] })
    const policies: (PolicySpec | null)[] = []
    bus.on('intent:policy', (p) => policies.push(p))

    await user.click(screen.getByRole('button', { name: 'Kamikaze guard' }))
    await user.click(screen.getByRole('button', { name: 'Return at 20%' }))
    await user.click(screen.getByRole('button', { name: 'Clear policy' }))
    expect(policies).toEqual([
      { kind: 'kamikazeOn', radiusM: 600 },
      { kind: 'returnAtBatteryPct', pct: 20 },
      null,
    ])
  })

  it('self-destruct publishes its intent, uplink selection arms the sweep', async () => {
    const user = userEvent.setup()
    const view = humanView()
    bus.emit('view', view)
    bus.emit('selection', { drones: [view.ownDrones[0]!], structures: [], nodes: [] })
    let destructs = 0
    bus.on('intent:selfDestruct', () => destructs++)
    await user.click(screen.getByRole('button', { name: 'Self-destruct' }))
    expect(destructs).toBe(1)

    const uplink = view.structures.find((st) => st.kind === 'satellite-uplink')!
    bus.emit('selection', { drones: [], structures: [uplink], nodes: [] })
    const sweeps: boolean[] = []
    bus.on('intent:sweepMode', (on) => sweeps.push(on))
    await user.click(screen.getByRole('button', { name: 'Arm satellite sweep' }))
    expect(sweeps).toEqual([true])
  })
})

describe('C-05 build queue and menu flow', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('queued builds show a count badge and progress on the build tile', () => {
    const v0 = humanView((v) => {
      v.tick = 100
      v.builds = [
        { id: 'b1', playerId: 'human', structureId: 's', specId: 'fpv-strike', readyAtTick: 150 },
        { id: 'b2', playerId: 'human', structureId: 's', specId: 'fpv-strike', readyAtTick: 250 },
      ]
    })
    bus.emit('view', v0)
    selectFactory(bus, v0)
    const tile = screen.getByRole('button', { name: 'Build FPV strike quad (7-inch class)' })
    const count = tile.querySelector('.tile-count') as HTMLElement
    expect(count.textContent).toBe('2')
    expect(count.style.display).not.toBe('none')
    // fpv builds in 5s = 100 ticks; the job on the line has 50 left => 50%.
    expect((tile.querySelector('.tile-progress') as HTMLElement).style.width).toBe('50%')

    // Queue drained: badge hides, progress resets.
    bus.emit('view', humanView((v) => (v.builds = [])))
    expect(count.style.display).toBe('none')
    expect((tile.querySelector('.tile-progress') as HTMLElement).style.width).toBe('0%')
  })

  it('the start menu deploys a match with the chosen difficulty', async () => {
    const user = userEvent.setup()
    const starts: { seed: number; difficulty: string }[] = []
    bus.on('intent:startMatch', (s) => starts.push(s))
    await user.click(screen.getByRole('radio', { name: 'hard' }))
    await user.click(screen.getByRole('button', { name: 'Deploy' }))
    expect(starts.length).toBe(1)
    expect(starts[0]!.difficulty).toBe('hard')
    expect(Number.isFinite(starts[0]!.seed)).toBe(true)
    // Menu hides itself after deploying.
    expect(document.querySelector('.menu-overlay')!.classList.contains('hidden')).toBe(true)
  })

  it('the defeat screen can reopen the setup menu', async () => {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Deploy' }))
    bus.emit('view', humanView((v) => (v.winner = 'bot')))
    expect(screen.getByRole('heading', { name: 'DEFEAT' })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Change setup' }))
    expect(document.querySelector('.menu-overlay')!.classList.contains('hidden')).toBe(false)
  })

  it('the mute toggle publishes intent:mute', async () => {
    const user = userEvent.setup()
    const mutes: boolean[] = []
    bus.on('intent:mute', (m) => mutes.push(m))
    const btn = screen.getByRole('button', { name: 'toggle sound' })
    await user.click(btn)
    await user.click(btn)
    expect(mutes).toEqual([true, false])
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('wind chip flags dangerous wind', () => {
    bus.emit('view', humanView((v) => (v.wind.speedMps = 11)))
    expect(document.querySelector('.wind-chip')!.classList.contains('warn')).toBe(true)
    bus.emit('view', humanView((v) => (v.wind.speedMps = 4)))
    expect(document.querySelector('.wind-chip')!.classList.contains('warn')).toBe(false)
  })
})

describe('C-05 construction panel and power', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('appears with the CENTCOM selected and emits construct intents', async () => {
    const user = userEvent.setup()
    const view = humanView()
    bus.emit('view', view)
    const panel = document.querySelector('.construct-menu') as HTMLElement
    expect(panel.style.display).toBe('none')

    const cc = view.structures.find((st) => st.kind === 'centcomm' && st.playerId === 'human')!
    bus.emit('selection', { drones: [], structures: [cc], nodes: [] })
    expect(panel.style.display).not.toBe('none')

    const intents: string[] = []
    bus.on('intent:construct', ({ kind }) => intents.push(kind))
    await user.click(screen.getByRole('button', { name: 'Construct Power plant' }))
    expect(intents).toEqual(['power-plant'])

    // Placement armed: the tile lights up and the card explains the flow.
    bus.emit('placeModeChanged', 'power-plant')
    expect(panel.querySelector('.build-tile.placing')).not.toBeNull()
    expect(panel.querySelector('.bc-name')!.textContent).toBe('Power plant')
    expect(panel.textContent).toContain('Placing')
    bus.emit('placeModeChanged', null)
    expect(panel.querySelector('.build-tile.placing')).toBeNull()

    // Deselecting hides the panel again.
    bus.emit('selection', { drones: [], structures: [], nodes: [] })
    expect(panel.style.display).toBe('none')
  })

  it('structure tiles lock with the reason on the band when the bank is short', () => {
    const view = humanView((v) => (v.economy.credits = 0))
    bus.emit('view', view)
    const cc = view.structures.find((st) => st.kind === 'centcomm' && st.playerId === 'human')!
    bus.emit('selection', { drones: [], structures: [cc], nodes: [] })
    const tile = () => screen.getByRole('button', { name: 'Construct Factory' })
    expect(tile().getAttribute('aria-disabled')).toBe('true')
    expect(tile().querySelector('.tile-tag')!.textContent).toBe('NEED CREDITS')
    bus.emit('view', humanView())
    expect(tile().getAttribute('aria-disabled')).toBe('false')
    // The missile defense battery is on the construction card too.
    expect(screen.getByRole('button', { name: 'Construct Missile defense' })).toBeDefined()
  })

  it('hovering a construction tile shows the info card: name, role, need/have costs, deps', async () => {
    const user = userEvent.setup()
    const view = humanView()
    bus.emit('view', view)
    const cc = view.structures.find((st) => st.kind === 'centcomm' && st.playerId === 'human')!
    bus.emit('selection', { drones: [], structures: [cc], nodes: [] })

    const panel = document.querySelector('.construct-menu') as HTMLElement
    await user.hover(screen.getByRole('button', { name: 'Construct Missile defense' }))
    expect(panel.querySelector('.bc-name')!.textContent).toBe('Missile defense')
    expect(panel.querySelector('.bc-desc')!.textContent).toContain('shoots down')
    const chips = [...panel.querySelectorAll('.bc-cost')]
    // lithium 15/50 ok, plastic 40/100 ok, credits 800/5000 ok, power 15/25 ok.
    expect(chips[0]!.className).toContain('ok')
    expect(chips[0]!.textContent).toContain('15 / 50')
    expect(chips[3]!.textContent).toContain('15 / 25')
    expect(panel.querySelector('.bc-dep')).not.toBeNull()

    // Short bank: the plastic chip flips red.
    bus.emit('view', humanView((v) => (v.economy.plasticKg = 5)))
    const plastic = [...panel.querySelectorAll('.bc-cost')][1]!
    expect(plastic.className).toContain('short')
    expect(plastic.textContent).toContain('40 / 5')
  })

  it('the resource strip shows grid power and flags brownouts', () => {
    bus.emit('view', humanView())
    const value = document.querySelector('.res-power .res-value') as HTMLElement
    expect(value.textContent).toBe('Power 75/100')
    bus.emit('view', humanView((v) => (v.power = { used: 95, cap: 40 })))
    expect(value.textContent).toBe('LOW POWER 95/40')
    expect(value.closest('.res')!.classList.contains('warn')).toBe(true)
  })
})

describe('C-05 live plate: activity color, status and target', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('a mining miner gets a teal frame, a MINING tag and its target node named', () => {
    const view = humanView((v) => {
      const miner = v.ownDrones.find((d) => v.catalog[d.specId]?.class === 'mining')!
      miner.mode = 'mining'
      miner.nodeId = v.nodes.find((n) => n.kind === 'lithium')!.id
    })
    bus.emit('view', view)
    const miner = view.ownDrones.find((d) => view.catalog[d.specId]?.class === 'mining')!
    bus.emit('selection', { drones: [miner], structures: [], nodes: [] })

    expect(document.querySelector('.portrait')!.classList.contains('mode-mining')).toBe(true)
    expect(document.querySelector('.mode-tag')!.textContent).toBe('MINING')
    expect(document.querySelector('.mode-tag')!.classList.contains('mode-mining')).toBe(true)
    expect(document.querySelector('.plate-target')!.textContent).toContain('Lithium crystals')
  })

  it('the plate refreshes live when the unit changes activity, without re-selecting', () => {
    const v0 = humanView()
    bus.emit('view', v0)
    const scout = v0.ownDrones.find((d) => d.specId === 'mavic3')!
    bus.emit('selection', { drones: [scout], structures: [], nodes: [] })
    expect(document.querySelector('.mode-tag')!.textContent).toBe('IDLE')

    bus.emit('view', humanView((v) => (v.ownDrones.find((d) => d.id === scout.id)!.mode = 'returning')))
    expect(document.querySelector('.mode-tag')!.textContent).toBe('RETURNING')
    expect(document.querySelector('.portrait')!.classList.contains('mode-returning')).toBe(true)
    expect(document.querySelector('.plate-target')!.textContent).toContain('Returning to base')
  })

  it('an air-defense battery reports its missile rack', () => {
    const view = humanView((v) => {
      v.structures.push({
        id: 'ad1',
        kind: 'air-defense',
        playerId: 'human',
        pos: { x: 900, y: 0, z: 900 },
        hp: 1800,
        hpMax: 1800,
        ammo: 5,
      })
    })
    bus.emit('view', view)
    bus.emit('selection', { drones: [], structures: [view.structures.at(-1)!], nodes: [] })
    expect(document.querySelector('.plate-info')!.textContent).toContain('missiles 5/8')
  })
})

describe('C-05 cursor tooltip', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('order slots grow a cursor-following tooltip and the panel has no text strip', async () => {
    const user = userEvent.setup()
    bus.emit('view', humanView())
    expect(document.querySelector('.order-tooltip')).toBeNull()

    await user.hover(screen.getByRole('button', { name: 'Stop' }))
    const tip = document.querySelector('.cursor-tip') as HTMLElement
    expect(tip).not.toBeNull()
    expect(tip.style.display).toBe('block')
    expect(tip.textContent).toContain('STOP')
    expect(tip.textContent).toContain('Hold position')

    await user.unhover(screen.getByRole('button', { name: 'Stop' }))
    expect(tip.style.display).toBe('none')
  })
})

describe('C-05 structure and node selection', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('selecting a building shows its animated portrait and hull bar', () => {
    const view = humanView()
    bus.emit('view', view)
    const base = view.structures.find((s) => s.kind === 'centcomm')!
    base.hp = base.hpMax * 0.6
    bus.emit('selection', { drones: [], structures: [base], nodes: [] })

    const portrait = document.querySelector('.portrait') as HTMLElement
    expect(portrait.dataset.structure).toBe('centcomm')
    expect(portrait.querySelector('.p-rotor')).not.toBeNull() // radar sweep
    expect(document.querySelector('.plate-info')!.textContent).toContain('CENTCOM base')
    expect(document.querySelector('.stat-value')!.textContent).toContain('7200/12000')
  })

  it('selecting a resource node shows its reserve', () => {
    const view = humanView()
    bus.emit('view', view)
    const node = view.nodes.find((n) => n.kind === 'lithium')!
    node.remainingKg = 750
    bus.emit('selection', { drones: [], structures: [], nodes: [node] })

    const portrait = document.querySelector('.portrait') as HTMLElement
    expect(portrait.dataset.node).toBe('lithium')
    expect(document.querySelector('.plate-info')!.textContent).toContain('Lithium crystals')
    expect(document.querySelector('.stat-value')!.textContent).toContain('750 kg left')
  })

  it('the factory panel appears only while the factory is selected', () => {
    const view = humanView()
    bus.emit('view', view)
    const panel = document.querySelector('.build-menu') as HTMLElement
    expect(panel.style.display).toBe('none')
    selectFactory(bus, view)
    expect(panel.style.display).toBe('')
    bus.emit('selection', { drones: [], structures: [], nodes: [] })
    expect(panel.style.display).toBe('none')
  })

  it('drone orders stay disabled when only a building is selected', () => {
    const view = humanView()
    bus.emit('view', view)
    const base = view.structures.find((st) => st.kind === 'centcomm')!
    bus.emit('selection', { drones: [], structures: [base], nodes: [] })
    expect(screen.getByRole('button', { name: 'Kamikaze guard' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
  })
})

describe('C-05 drone roles', () => {
  it('every seed drone has a role tag and a what-it-does line', () => {
    for (const spec of SEED_DRONES) {
      const role = droneRole(spec)
      expect(['RECON', 'STRIKE', 'SIEGE', 'BOMBER', 'JET', 'MINER', 'CARGO']).toContain(role.tag)
      expect(role.text.length).toBeGreaterThan(15)
    }
  })

  it('build tiles show the role tag; the description lives in the hover card', async () => {
    document.body.innerHTML = ''
    const bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
    const user = userEvent.setup()
    const v0 = humanView()
    bus.emit('view', v0)
    selectFactory(bus, v0)
    const fpv = screen.getByRole('button', { name: /Build FPV strike quad/ })
    expect(fpv.textContent).toContain('STRIKE')
    await user.hover(fpv)
    expect(document.querySelector('.build-menu:not(.construct-menu) .bc-desc')!.textContent).toContain(
      'Cheap kamikaze',
    )
    const miner = screen.getByRole('button', { name: /Build Ore miner/ })
    expect(miner.textContent).toContain('MINER')
  })

  it('the unit plate shows the role tag and numeric hull', () => {
    document.body.innerHTML = ''
    const bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
    const view = humanView()
    bus.emit('view', view)
    const scout = view.ownDrones.find((d) => d.specId === 'mavic3')!
    bus.emit('selection', { drones: [scout], structures: [], nodes: [] })
    const info = document.querySelector('.plate-info')!
    expect(info.textContent).toContain('RECON')
    expect(info.textContent).toMatch(/\d+\/\d+/)
  })
})

describe('C-05 enemy intel and thumbnails', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('selecting an enemy drone shows a hostile intel plate, no orders', () => {
    bus.emit('view', humanView())
    const hostile = makeDrone(getDrone('fpv-strike')!, 'bot', { x: 2000, y: 60, z: 2000 }, 'foe-1')
    hostile.hp = hostile.hpMax * 0.4
    bus.emit('selection', { drones: [hostile], structures: [], nodes: [] })

    const info = document.querySelector('.plate-info')!
    expect(info.textContent).toContain('HOSTILE')
    expect(info.textContent).toContain('FPV strike quad')
    expect(info.textContent).toContain('STRIKE') // role intel stays visible
    expect(info.textContent).not.toContain('battery') // no friendly telemetry
    expect(document.querySelector('.plate')!.classList.contains('hostile')).toBe(true)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
  })

  it('rendered thumbnails replace fallback icons on tiles and the plate', () => {
    const v0 = humanView()
    bus.emit('view', v0)
    selectFactory(bus, v0)
    const px =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    bus.emit('thumbnails', {
      drones: Object.fromEntries(SEED_DRONES.map((s) => [s.id, px])),
      structures: { centcomm: px },
      nodes: { lithium: px },
    })
    const fpv = screen.getByRole('button', { name: /Build FPV strike quad/ })
    const img = fpv.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('data:image/png')
    expect(fpv.querySelector('.tile-fallback')).toBeNull()

    const view = humanView()
    bus.emit('selection', { drones: [view.ownDrones[0]!], structures: [], nodes: [] })
    expect(document.querySelector('.portrait-img')).not.toBeNull()
  })
})
