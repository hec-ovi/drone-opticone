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

  it('build menu enables affordable drones, disables the rest, and emits build intents', async () => {
    const user = userEvent.setup()
    bus.emit('view', humanView())

    const fpv = screen.getByRole('button', { name: /Build FPV strike quad/ })
    const tb2 = screen.getByRole('button', { name: /Build Baykar Bayraktar TB2/ })
    expect(fpv).toBeEnabled()
    // A TB2 costs 250k credits at 5% of the real unit price; the start stash is 5k.
    expect(tb2).toBeDisabled()

    const intents: { specId: string }[] = []
    bus.on('intent:build', (i) => intents.push(i))
    await user.click(fpv)
    expect(intents).toEqual([{ specId: 'fpv-strike' }])
  })

  it('build menu reacts to economy changes', () => {
    bus.emit('view', humanView((v) => (v.economy.credits = 0)))
    expect(screen.getByRole('button', { name: /Build FPV strike quad/ })).toBeDisabled()
    bus.emit('view', humanView())
    expect(screen.getByRole('button', { name: /Build FPV strike quad/ })).toBeEnabled()
  })

  it('satellite sweep button toggles and follows shell resets', async () => {
    const user = userEvent.setup()
    const modes: boolean[] = []
    bus.on('intent:sweepMode', (on) => modes.push(on))

    const btn = screen.getByRole('button', { name: 'Satellite sweep' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(modes).toEqual([true])

    // The shell announces the mode was consumed after a sweep click.
    bus.emit('sweepModeChanged', false)
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('selection panel lists selected drones with battery and link state', () => {
    const view = humanView()
    bus.emit('view', view)
    const scout = view.ownDrones.find((d) => d.specId === 'mavic3')!
    scout.batteryWh = 77 / 2
    scout.uncontrolled = true
    bus.emit('selection', { drones: [scout], structures: [], nodes: [] })

    const list = within(screen.getByRole('heading', { name: 'Selection' }).parentElement as HTMLElement)
    expect(list.getByText(/DJI Mavic 3/)).toBeDefined()
    expect(list.getByText(/battery 50%/)).toBeDefined()
    expect(list.getByText(/NO LINK/)).toBeDefined()
  })

  it('event log prints battle events, newest first', () => {
    bus.emit('events', [
      { type: 'destroyed', entityId: 'e1', playerId: 'human', cause: 'battery' },
      { type: 'batteryLow', droneId: 'e2', playerId: 'human', pct: 20 },
    ])
    const log = screen.getByRole('log', { name: 'battle log' })
    const lines = [...log.querySelectorAll('p')].map((p) => p.textContent)
    expect(lines[0]).toContain('e2 battery below 20%')
    expect(lines[1]).toContain('e1 down (battery)')
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
