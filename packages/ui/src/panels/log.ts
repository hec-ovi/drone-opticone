import type { Bus, ClientTopics, SimEvent } from '@opticone/shared'
import { ICONS, iconEl } from '../icons'
import { el } from '../dom'

/** Battle log: newest first, color-coded, capped at 8 lines. */
export function eventLog(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel event-log', root)
  panel.setAttribute('role', 'log')
  panel.setAttribute('aria-label', 'battle log')
  const heading = el('h2', '', panel)
  heading.textContent = 'Battle log'
  const lines = el('div', 'event-lines', panel)
  const describe = (e: SimEvent): { text: string; icon: string; cls: string } | null => {
    switch (e.type) {
      case 'destroyed':
        return { text: `${e.entityId} down (${e.cause})`, icon: ICONS.alert, cls: 'ev-loss' }
      case 'batteryLow':
        return { text: `${e.droneId} battery below ${e.pct}%`, icon: ICONS.battery, cls: 'ev-warn' }
      case 'spawned':
        return { text: `${e.specId} ready`, icon: ICONS.spawn, cls: 'ev-good' }
      case 'matchEnded':
        return { text: `Match over: ${e.winner} wins`, icon: ICONS.flag, cls: 'ev-final' }
      default:
        return null
    }
  }
  return bus.on('events', (events: SimEvent[]) => {
    for (const e of events) {
      const d = describe(e)
      if (!d) continue
      const line = document.createElement('p')
      line.className = `ev ${d.cls}`
      line.appendChild(iconEl(d.icon, 'icon icon-s'))
      line.appendChild(document.createTextNode(d.text))
      lines.prepend(line)
      while (lines.children.length > 8) lines.removeChild(lines.lastChild!)
    }
  })
}
