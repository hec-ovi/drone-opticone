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

  it('the sweep toggle lives on the tactical map and arms sweep mode', async () => {
    const user = userEvent.setup()
    const modes: boolean[] = []
    bus.on('intent:sweepMode', (on) => modes.push(on))
    const btn = screen.getByRole('button', { name: 'Satellite sweep' })
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(modes).toEqual([true])
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

  it('policy buttons publish typed policy intents', async () => {
    const user = userEvent.setup()
    bus.emit('view', humanView())
    const fpv = makeDrone(getDrone('fpv-strike')!, 'human', { x: 700, y: 60, z: 700 }, 'fpv-x')
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

  it('queued builds show progress bars', () => {
    bus.emit(
      'view',
      humanView((v) => {
        v.tick = 100
        v.builds = [{ id: 'b1', playerId: 'human', structureId: 's', specId: 'fpv-strike', readyAtTick: 150 }]
      }),
    )
    const fill = document.querySelector('.queue-fill') as HTMLElement
    expect(fill).not.toBeNull()
    // fpv builds in 5s = 100 ticks; 50 remaining => 50%.
    expect(fill.style.width).toBe('50%')
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
    expect(document.querySelector('.stat-value')!.textContent).toContain('3600/6000')
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

  it('build tiles show the role tag; description lives in the tooltip', () => {
    document.body.innerHTML = ''
    const bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
    bus.emit('view', humanView())
    const fpv = screen.getByRole('button', { name: /Build FPV strike quad/ })
    expect(fpv.textContent).toContain('STRIKE')
    expect(fpv.title).toContain('Cheap kamikaze')
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
    bus.emit('view', humanView())
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
