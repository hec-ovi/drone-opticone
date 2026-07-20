import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { Bus, type ClientTopics, type PlayerView } from '@opticone/shared'
import { getCatalog } from '@opticone/registry'
import { createMatch, snapshot, tick } from '@opticone/sim-core'
import { mountUI } from '@opticone/ui'

function humanView(mutate?: (v: PlayerView) => void): PlayerView {
  const s = tick(createMatch(3, 'map-1', ['human', 'bot'], getCatalog(), { fixedWind: { dirRad: 0, speedMps: 4 } }), []).state
  const view = snapshot(s, 'human')
  mutate?.(view)
  return view
}

describe('C-05 UI panels', () => {
  let bus: Bus<ClientTopics>

  beforeEach(() => {
    document.body.innerHTML = ''
    bus = new Bus<ClientTopics>()
    mountUI(document.body, bus)
  })

  it('resource bar renders economy and satellite state from the view topic', () => {
    bus.emit('view', humanView())
    const bar = screen.getByRole('status', { name: 'resources' })
    expect(bar.textContent).toContain('Credits 5.0k')
    expect(bar.textContent).toContain('Lithium 50 kg')
    expect(bar.textContent).toContain('Sat 100')
  })

  it('resource chips carry how-to tooltips and the oil pipeline shows live rates', async () => {
    const user = userEvent.setup()
    bus.emit('view', humanView((v) => (v.economy.oilKg = 40)))
    const bar = screen.getByRole('status', { name: 'resources' })
    expect(bar.textContent).toContain('Oil 40 kg -1/s')
    expect(bar.textContent).toContain('+0.5/s')

    await user.hover(document.querySelector('.res-lithium') as HTMLElement)
    const tip = () => document.querySelector('.cursor-tip') as HTMLElement
    expect(tip().textContent).toContain('crystal node')

    await user.hover(document.querySelector('.res-plastic') as HTMLElement)
    expect(tip().textContent).toContain('Cracked from oil')

    // Browned out: the power tooltip says exactly what to do.
    bus.emit('view', humanView((v) => (v.power = { used: 95, cap: 40 })))
    await user.hover(document.querySelector('.res-power') as HTMLElement)
    expect(tip().textContent).toContain('construct a power plant')
  })

  it('build menu locks unaffordable tiles WITH the reason on the tile, and emits build intents', async () => {
    const user = userEvent.setup()
    const v0 = humanView()
    bus.emit('view', v0)
    const factory = v0.structures.find((st) => st.kind === 'factory')!
    bus.emit('selection', { drones: [], structures: [factory], nodes: [] })

    const fpv = screen.getByRole('button', { name: /Build FPV strike quad/ })
    const tb2 = screen.getByRole('button', { name: /Build Baykar Bayraktar TB2/ })
    expect(fpv.getAttribute('aria-disabled')).toBe('false')
    // A TB2 airframe needs ~420 kg of plastic against a 100 kg start stash.
    // The tile stays hoverable and its band says what is missing.
    expect(tb2.getAttribute('aria-disabled')).toBe('true')
    expect(tb2.classList.contains('locked')).toBe(true)
    expect(tb2.querySelector('.tile-tag')!.textContent).toBe('NEED PLASTIC')

    const intents: { specId: string }[] = []
    bus.on('intent:build', (i) => intents.push(i))
    await user.click(tb2) // locked: swallowed
    await user.click(fpv)
    expect(intents).toEqual([{ specId: 'fpv-strike' }])
  })

  it('hovering a build tile fills the info card: name, role line, need/have, dep icons', async () => {
    const user = userEvent.setup()
    const v0 = humanView()
    bus.emit('view', v0)
    const factory = v0.structures.find((st) => st.kind === 'factory')!
    bus.emit('selection', { drones: [], structures: [factory], nodes: [] })
    const panel = document.querySelector('.build-menu:not(.construct-menu)') as HTMLElement

    const fpv = screen.getByRole('button', { name: /Build FPV strike quad/ })
    await user.hover(fpv)
    expect(panel.querySelector('.bc-name')!.textContent).toContain('FPV strike')
    expect(panel.querySelector('.bc-desc')!.textContent!.length).toBeGreaterThan(5)
    // Affordable from the start bank: every resource chip reads green.
    expect(panel.querySelectorAll('.bc-cost.ok').length).toBe(3)
    expect(panel.querySelectorAll('.bc-cost.short').length).toBe(0)
    expect(panel.querySelectorAll('.bc-dep').length).toBe(2)

    // Sticky card: leaving the tile keeps the last unit's info in place.
    await user.unhover(fpv)
    expect(panel.querySelector('.bc-name')!.textContent).toContain('FPV strike')
  })

  it('the info card is filled from the start: first airframe before any hover', () => {
    const v0 = humanView()
    bus.emit('view', v0)
    const factory = v0.structures.find((st) => st.kind === 'factory')!
    bus.emit('selection', { drones: [], structures: [factory], nodes: [] })
    const name = document.querySelector('.build-menu:not(.construct-menu) .bc-name')!
    expect(name.textContent!.length).toBeGreaterThan(3)
  })

  it('build menu reacts to economy changes', () => {
    const broke = humanView((v) => (v.economy.credits = 0))
    bus.emit('view', broke)
    const factory = broke.structures.find((st) => st.kind === 'factory')!
    bus.emit('selection', { drones: [], structures: [factory], nodes: [] })
    const fpv = () => screen.getByRole('button', { name: /Build FPV strike quad/ })
    expect(fpv().getAttribute('aria-disabled')).toBe('true')
    bus.emit('view', humanView())
    expect(fpv().getAttribute('aria-disabled')).toBe('false')
  })

  it('the sweep is an uplink order: selecting the uplink arms it', async () => {
    const user = userEvent.setup()
    const view = humanView()
    bus.emit('view', view)
    const modes: boolean[] = []
    bus.on('intent:sweepMode', (on) => modes.push(on))

    const slot = screen.getByRole('button', { name: 'Arm satellite sweep' })
    expect(slot).toBeDisabled()
    const uplink = view.structures.find((st) => st.kind === 'satellite-uplink')!
    bus.emit('selection', { drones: [], structures: [uplink], nodes: [] })
    expect(slot).toBeEnabled()
    await user.click(slot)
    expect(modes).toEqual([true])
  })

  it('selection panel lists selected drones with battery and link state', () => {
    const view = humanView()
    bus.emit('view', view)
    const scout = view.ownDrones.find((d) => d.specId === 'mavic3')!
    scout.batteryWh = 77 / 2
    scout.uncontrolled = true
    bus.emit('selection', { drones: [scout], structures: [], nodes: [] })

    const list = within(document.querySelector('.selection-panel') as HTMLElement)
    expect(list.getByText(/DJI Mavic 3/)).toBeDefined()
    expect(list.getByText(/battery 50%/)).toBeDefined()
    expect(list.getByText(/NO LINK/)).toBeDefined()
  })

  it('the battle log is gone: no log panel in the console', () => {
    bus.emit('view', humanView())
    expect(document.querySelector('.event-log')).toBeNull()
  })

  it('match banner appears on victory with a restart intent', async () => {
    const user = userEvent.setup()
    bus.emit('view', humanView((v) => (v.winner = 'human')))
    expect(screen.getByRole('heading', { name: 'VICTORY' })).toBeDefined()

    let restarts = 0
    bus.on('intent:restart', () => restarts++)
    await user.click(screen.getByRole('button', { name: 'Play again' }))
    expect(restarts).toBe(1)
  })
})
