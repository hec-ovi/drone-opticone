import type { Bus, ClientTopics, PlayerView, Selection } from '@opticone/shared'
import { iconEl } from '../icons'
import { ORDER_ICONS } from '../order-icons'
import { button, el } from '../dom'
import { isWarhead } from '../display'

/**
 * Order grid: a fixed 3x3 command card. Icon-only slots light up for the
 * unit types that support them (empty slots stay recessed), a tooltip strip
 * above the grid names the hovered order.
 */
interface OrderDef {
  slot: number
  label: string
  desc: string
  icon: string
  danger?: boolean
  applies(sel: Selection, catalog: PlayerView['catalog'], playerId: string): boolean
  fire(bus: Bus<ClientTopics>): void
}

const ORDERS: OrderDef[] = [
  {
    slot: 0,
    label: 'Stop',
    desc: 'Hold position and go idle.',
    icon: ORDER_ICONS.stop,
    applies: (sel, _c, pid) => sel.drones.some((d) => d.playerId === pid),
    fire: (bus) => bus.emit('intent:stop', null),
  },
  {
    slot: 1,
    label: 'Mine nearest node',
    desc: 'Send miners to the closest visible resource node.',
    icon: ORDER_ICONS.mine,
    applies: (sel, c, pid) =>
      sel.drones.some((d) => d.playerId === pid && ['mining', 'cargo'].includes(c[d.specId]?.class ?? '')),
    fire: (bus) => bus.emit('intent:mineNearest', null),
  },
  {
    slot: 2,
    label: 'Kamikaze guard',
    desc: 'Standing order: dive on any enemy within 600 m.',
    icon: ORDER_ICONS.guard,
    applies: (sel, c, pid) =>
      sel.drones.some((d) => d.playerId === pid && c[d.specId] && isWarhead(c[d.specId]!)),
    fire: (bus) => bus.emit('intent:policy', { kind: 'kamikazeOn', radiusM: 600 }),
  },
  {
    slot: 3,
    label: 'Return at 20%',
    desc: 'Standing order: fly home at 20% battery.',
    icon: ORDER_ICONS.home,
    applies: (sel, c, pid) =>
      sel.drones.some((d) => d.playerId === pid && (c[d.specId]?.batteryWh ?? null) !== null),
    fire: (bus) => bus.emit('intent:policy', { kind: 'returnAtBatteryPct', pct: 20 }),
  },
  {
    slot: 4,
    label: 'Hunt quads',
    desc: 'Standing order: chase and ram enemy multirotors.',
    icon: ORDER_ICONS.hunt,
    applies: (sel, c, pid) =>
      sel.drones.some((d) => d.playerId === pid && c[d.specId] && isWarhead(c[d.specId]!)),
    fire: (bus) => bus.emit('intent:policy', { kind: 'huntClass', droneClass: 'multirotor' }),
  },
  {
    slot: 5,
    label: 'Clear policy',
    desc: 'Drop the standing order.',
    icon: ORDER_ICONS.clear,
    applies: (sel, _c, pid) => sel.drones.some((d) => d.playerId === pid),
    fire: (bus) => bus.emit('intent:policy', null),
  },
  {
    slot: 6,
    label: 'Arm satellite sweep',
    desc: 'Then click anywhere on the field to scan it.',
    icon: ORDER_ICONS.sweep,
    applies: (sel, _c, pid) =>
      sel.structures.some((s) => s.playerId === pid && s.kind === 'satellite-uplink'),
    fire: (bus) => bus.emit('intent:sweepMode', true),
  },
  {
    slot: 8,
    label: 'Self-destruct',
    desc: 'Detonate the selected drones in place.',
    icon: ORDER_ICONS.scuttle,
    danger: true,
    applies: (sel, _c, pid) => sel.drones.some((d) => d.playerId === pid),
    fire: (bus) => bus.emit('intent:selfDestruct', null),
  },
]

export function commandCard(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel command-card', root)
  const heading = el('h2', '', panel)
  heading.textContent = 'Orders'
  const tooltip = el('p', 'order-tooltip', panel)
  const grid = el('div', 'order-grid', panel)

  let catalog: PlayerView['catalog'] = {}
  let playerId = ''
  let selection: Selection = { drones: [], structures: [], nodes: [] }

  const slots: (HTMLButtonElement | HTMLElement)[] = []
  for (let i = 0; i < 9; i++) {
    const def = ORDERS.find((o) => o.slot === i)
    if (!def) {
      slots.push(el('span', 'order-slot vacant', grid))
      continue
    }
    const b = button(`order-slot${def.danger ? ' danger' : ''}`, grid, def.label)
    b.appendChild(iconEl(def.icon, 'icon order-icon'))
    b.title = def.label
    b.disabled = true
    b.addEventListener('click', () => def.fire(bus))
    b.addEventListener('mouseenter', () => (tooltip.textContent = `${def.label}. ${def.desc}`))
    b.addEventListener('focus', () => (tooltip.textContent = `${def.label}. ${def.desc}`))
    b.addEventListener('mouseleave', () => (tooltip.textContent = ''))
    slots.push(b)
  }

  const refresh = () => {
    for (const def of ORDERS) {
      const b = slots[def.slot] as HTMLButtonElement
      const on = def.applies(selection, catalog, playerId)
      b.disabled = !on
      b.classList.toggle('armed', on)
    }
  }

  const offView = bus.on('view', (view: PlayerView) => {
    catalog = view.catalog
    playerId = view.playerId
  })
  const offSel = bus.on('selection', (sel: Selection) => {
    selection = sel
    refresh()
  })
  return () => {
    offView()
    offSel()
  }
}
