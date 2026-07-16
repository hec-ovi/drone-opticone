import type { Bus, ClientTopics, PlayerView, SimEvent } from '@opticone/shared'

/**
 * C-05 mountUI. Every panel is isolated: it reads bus topics and publishes
 * intents. No three.js, no sim imports, no direct backend calls.
 */
export interface UIHandle {
  dispose(): void
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  parent.appendChild(node)
  return node
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)
}

function resourceBar(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const bar = el('div', 'panel resource-bar', root)
  bar.setAttribute('role', 'status')
  bar.setAttribute('aria-label', 'resources')
  const spans = {
    credits: el('span', 'res', bar),
    lithium: el('span', 'res', bar),
    oil: el('span', 'res', bar),
    plastic: el('span', 'res', bar),
    satellite: el('span', 'res', bar),
    wind: el('span', 'res', bar),
  }
  return bus.on('view', (view: PlayerView) => {
    spans.credits.textContent = `Credits ${fmt(view.economy.credits)}`
    spans.lithium.textContent = `Lithium ${fmt(view.economy.lithiumKg)} kg`
    spans.oil.textContent = `Oil ${fmt(view.economy.oilKg)} kg`
    spans.plastic.textContent = `Plastic ${fmt(view.economy.plasticKg)} kg`
    spans.satellite.textContent = `Sat ${view.satellite.energy.toFixed(0)}`
    spans.wind.textContent = `Wind ${view.wind.speedMps.toFixed(1)} m/s`
  })
}

function buildMenu(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel build-menu', root)
  const heading = el('h2', '', panel)
  heading.textContent = 'Factory'
  const list = el('div', 'build-list', panel)
  const buttons = new Map<string, HTMLButtonElement>()

  return bus.on('view', (view: PlayerView) => {
    for (const spec of Object.values(view.catalog)) {
      let btn = buttons.get(spec.id)
      if (!btn) {
        btn = document.createElement('button')
        btn.type = 'button'
        btn.textContent = `Build ${spec.name}`
        btn.addEventListener('click', () => bus.emit('intent:build', { specId: spec.id }))
        buttons.set(spec.id, btn)
        list.appendChild(btn)
      }
      // Affordability mirrors the sim build cost rule (C-03 tuning).
      const lithium = spec.batteryWh !== null ? spec.batteryWh * 0.02 : 5
      const plastic = spec.massKg * 0.6
      const credits = spec.costCredits * 0.05
      const affordable =
        view.economy.lithiumKg >= lithium && view.economy.plasticKg >= plastic && view.economy.credits >= credits
      btn.disabled = !affordable
      btn.title = `${lithium.toFixed(1)} kg lithium, ${plastic.toFixed(1)} kg plastic, ${credits.toFixed(0)} credits`
    }
  })
}

function satellitePanel(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel satellite-panel', root)
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = 'Satellite sweep'
  btn.setAttribute('aria-pressed', 'false')
  panel.appendChild(btn)
  let active = false
  btn.addEventListener('click', () => {
    active = !active
    btn.setAttribute('aria-pressed', String(active))
    bus.emit('intent:sweepMode', active)
  })
  return bus.on('sweepModeChanged', (on: boolean) => {
    active = on
    btn.setAttribute('aria-pressed', String(on))
  })
}

function selectionPanel(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel selection-panel', root)
  const heading = el('h2', '', panel)
  heading.textContent = 'Selection'
  const list = el('ul', 'selection-list', panel)
  let catalog: PlayerView['catalog'] = {}
  const offView = bus.on('view', (view: PlayerView) => (catalog = view.catalog))
  const offSel = bus.on('selection', (drones) => {
    list.textContent = ''
    for (const d of drones) {
      const spec = catalog[d.specId]
      const li = document.createElement('li')
      const pct = spec?.batteryWh ? Math.round((d.batteryWh / spec.batteryWh) * 100) : null
      li.textContent = `${spec?.name ?? d.specId} [${d.mode}]${pct !== null ? ` battery ${pct}%` : ''}${
        d.uncontrolled ? ' NO LINK' : ''
      }`
      list.appendChild(li)
    }
  })
  return () => {
    offView()
    offSel()
  }
}

function eventLog(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel event-log', root)
  panel.setAttribute('role', 'log')
  panel.setAttribute('aria-label', 'battle log')
  const describe = (e: SimEvent): string | null => {
    switch (e.type) {
      case 'destroyed':
        return `${e.entityId} down (${e.cause})`
      case 'batteryLow':
        return `${e.droneId} battery below ${e.pct}%`
      case 'spawned':
        return `${e.specId} ready`
      case 'matchEnded':
        return `Match over: ${e.winner} wins`
      default:
        return null
    }
  }
  return bus.on('events', (events: SimEvent[]) => {
    for (const e of events) {
      const text = describe(e)
      if (!text) continue
      const line = document.createElement('p')
      line.textContent = text
      panel.prepend(line)
      while (panel.children.length > 8) panel.removeChild(panel.lastChild!)
    }
  })
}

function matchBanner(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const banner = el('div', 'panel match-banner hidden', root)
  const text = el('h1', '', banner)
  const restart = document.createElement('button')
  restart.type = 'button'
  restart.textContent = 'Play again'
  restart.addEventListener('click', () => bus.emit('intent:restart', null))
  banner.appendChild(restart)
  return bus.on('view', (view: PlayerView) => {
    if (view.winner) {
      text.textContent = view.winner === view.playerId ? 'VICTORY' : 'DEFEAT'
      banner.classList.remove('hidden')
    } else {
      banner.classList.add('hidden')
    }
  })
}

export function mountUI(root: HTMLElement, bus: Bus<ClientTopics>): UIHandle {
  const offs = [
    resourceBar(root, bus),
    buildMenu(root, bus),
    satellitePanel(root, bus),
    selectionPanel(root, bus),
    eventLog(root, bus),
    matchBanner(root, bus),
  ]
  return { dispose: () => offs.forEach((off) => off()) }
}
