import type { Bus, ClientTopics } from '@opticone/shared'
import { el } from './dom'
import { minimapPanel } from './minimap'
import { resourceStrip } from './panels/resources'
import { selectionPanel } from './panels/plate'
import { commandCard } from './panels/orders'
import { buildMenu } from './panels/factory'
import { eventLog } from './panels/log'
import { matchBanner, menuOverlay } from './panels/overlays'

/**
 * C-05 mountUI: pure composition. One command console docked at the bottom
 * holds every panel; overlays (menu, banner) float above the field. Each
 * panel lives in its own module, reads bus topics and publishes intents.
 */
export interface UIHandle {
  dispose(): void
}

export function mountUI(root: HTMLElement, bus: Bus<ClientTopics>): UIHandle {
  const console_ = el('div', 'console', root)
  const offTop = resourceStrip(console_, bus)
  const main = el('div', 'console-main', console_)

  const offs = [
    offTop,
    minimapPanel(main, bus),
    selectionPanel(main, bus),
    commandCard(main, bus),
    buildMenu(main, bus),
    eventLog(main, bus),
    matchBanner(root, bus),
    menuOverlay(root, bus),
  ]
  return { dispose: () => offs.forEach((off) => off()) }
}
