import type { Bus, ClientTopics, DroneSpec, DroneState, PlayerView, SimEvent } from '@opticone/shared'
import { ICONS, droneClassIcon, iconEl } from './icons'
import { portraitEl } from './portraits'
import { minimapPanel } from './minimap'

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

function button(className: string, parent: HTMLElement, label?: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = className
  if (label) b.setAttribute('aria-label', label)
  parent.appendChild(b)
  return b
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)
}

function clockText(tick: number): string {
  const s = Math.floor(tick / 20)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Build cost and time, display mirror of the C-03 tuning rules. */
export function displayBuildCost(spec: DroneSpec): { lithiumKg: number; plasticKg: number; credits: number } {
  return {
    lithiumKg: spec.batteryWh !== null ? spec.batteryWh * 0.02 : 5,
    plasticKg: spec.massKg * 0.6,
    credits: spec.costCredits * 0.05,
  }
}

export function displayBuildTimeS(spec: DroneSpec): number {
  return Math.min(120, Math.max(5, spec.massKg))
}

// ---------------------------------------------------------------- topbar --

function topbar(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const bar = el('header', 'topbar', root)

  const brand = el('div', 'brand', bar)
  brand.appendChild(iconEl(droneClassIcon('multirotor'), 'brand-icon'))
  const brandText = el('span', 'brand-text', brand)
  brandText.textContent = 'DRONE OPTICONE'

  const res = el('div', 'panel resource-bar', bar)
  res.setAttribute('role', 'status')
  res.setAttribute('aria-label', 'resources')
  const chip = (icon: string, cls: string) => {
    const c = el('span', `res ${cls}`, res)
    c.appendChild(iconEl(icon))
    const v = el('span', 'res-value', c)
    return v
  }
  const credits = chip(ICONS.credits, 'res-credits')
  const lithium = chip(ICONS.lithium, 'res-lithium')
  const oil = chip(ICONS.oil, 'res-oil')
  const plastic = chip(ICONS.plastic, 'res-plastic')
  const sat = chip(ICONS.satellite, 'res-sat')

  const status = el('div', 'topbar-status', bar)
  const wind = el('span', 'res wind-chip', status)
  const windArrow = iconEl(ICONS.wind, 'icon wind-arrow')
  wind.appendChild(windArrow)
  const windValue = el('span', 'res-value', wind)
  const clock = el('span', 'res clock-chip', status)
  clock.appendChild(iconEl(ICONS.clock))
  const clockValue = el('span', 'res-value', clock)

  return bus.on('view', (view: PlayerView) => {
    credits.textContent = `Credits ${fmt(view.economy.credits)}`
    lithium.textContent = `Lithium ${fmt(view.economy.lithiumKg)} kg`
    oil.textContent = `Oil ${fmt(view.economy.oilKg)} kg`
    plastic.textContent = `Plastic ${fmt(view.economy.plasticKg)} kg`
    sat.textContent = `Sat ${view.satellite.energy.toFixed(0)}`
    windValue.textContent = `Wind ${view.wind.speedMps.toFixed(1)} m/s`
    wind.classList.toggle('warn', view.wind.speedMps > 9)
    windArrow.style.transform = `rotate(${(view.wind.dirRad * 180) / Math.PI}deg)`
    clockValue.textContent = clockText(view.tick)
  })
}

// ------------------------------------------------------------ build menu --

function buildMenu(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel build-menu', root)
  const heading = el('h2', '', panel)
  heading.textContent = 'Factory'
  const list = el('div', 'build-list', panel)
  const queueWrap = el('div', 'build-queue', panel)
  const cards = new Map<string, { btn: HTMLButtonElement; costs: Record<string, HTMLElement> }>()

  return bus.on('view', (view: PlayerView) => {
    for (const spec of Object.values(view.catalog)) {
      let card = cards.get(spec.id)
      if (!card) {
        const btn = button('build-card', list)
        btn.setAttribute('aria-label', `Build ${spec.name}`)
        btn.appendChild(iconEl(droneClassIcon(spec.class), 'icon build-icon'))
        const info = el('span', 'build-info', btn)
        const name = el('span', 'build-name', info)
        name.textContent = spec.name
        const meta = el('span', 'build-meta', info)
        const costs: Record<string, HTMLElement> = {}
        const costChip = (icon: string, key: string) => {
          const c = el('span', 'cost-chip', meta)
          c.appendChild(iconEl(icon, 'icon icon-s'))
          costs[key] = el('span', '', c)
        }
        costChip(ICONS.lithium, 'lithium')
        costChip(ICONS.plastic, 'plastic')
        costChip(ICONS.credits, 'credits')
        costChip(ICONS.clock, 'time')
        btn.title = `${spec.class} | ${spec.massKg} kg | cruise ${spec.cruiseMps} m/s | wind limit ${spec.windLimitMps} m/s`
        btn.addEventListener('click', () => bus.emit('intent:build', { specId: spec.id }))
        card = { btn, costs }
        cards.set(spec.id, card)
      }
      const cost = displayBuildCost(spec)
      card.costs.lithium!.textContent = fmt(cost.lithiumKg)
      card.costs.plastic!.textContent = fmt(cost.plasticKg)
      card.costs.credits!.textContent = fmt(cost.credits)
      card.costs.time!.textContent = `${displayBuildTimeS(spec)}s`
      card.costs.lithium!.parentElement!.classList.toggle('missing', view.economy.lithiumKg < cost.lithiumKg)
      card.costs.plastic!.parentElement!.classList.toggle('missing', view.economy.plasticKg < cost.plasticKg)
      card.costs.credits!.parentElement!.classList.toggle('missing', view.economy.credits < cost.credits)
      card.btn.disabled =
        view.economy.lithiumKg < cost.lithiumKg ||
        view.economy.plasticKg < cost.plasticKg ||
        view.economy.credits < cost.credits
    }

    // Queue with live progress bars.
    queueWrap.textContent = ''
    for (const job of view.builds) {
      const spec = view.catalog[job.specId]
      if (!spec) continue
      const total = displayBuildTimeS(spec) * 20
      const progress = Math.max(0, Math.min(1, 1 - (job.readyAtTick - view.tick) / total))
      const row = el('div', 'queue-row', queueWrap)
      row.appendChild(iconEl(droneClassIcon(spec.class), 'icon icon-s'))
      const label = el('span', 'queue-name', row)
      label.textContent = spec.name
      const barBg = el('span', 'queue-bar', row)
      const fill = el('span', 'queue-fill', barBg)
      fill.style.width = `${(progress * 100).toFixed(0)}%`
    }
  })
}

// ------------------------------------------------------ selection + card --

function selectionPanel(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel selection-panel', root)
  const heading = el('h2', '', panel)
  heading.textContent = 'Selection'
  const body = el('div', 'selection-body', panel)
  const portraitSlot = el('div', 'portrait-slot', body)
  const detail = el('div', 'selection-detail', body)
  const empty = el('p', 'selection-empty', body)
  empty.textContent = 'No units selected. Drag or click on the field, 1-9 recalls a group.'

  let catalog: PlayerView['catalog'] = {}
  let portraitSpec: string | null = null
  const offView = bus.on('view', (view: PlayerView) => (catalog = view.catalog))

  const bar = (parent: HTMLElement, label: string, icon: string) => {
    const row = el('div', 'stat-row', parent)
    row.appendChild(iconEl(icon, 'icon icon-s'))
    const name = el('span', 'stat-label', row)
    name.textContent = label
    const track = el('span', 'stat-track', row)
    const fill = el('span', 'stat-fill', track)
    const value = el('span', 'stat-value', row)
    return { fill, value, row }
  }

  const offSel = bus.on('selection', (drones: DroneState[]) => {
    const primary = drones[0]
    detail.textContent = ''
    if (!primary) {
      portraitSlot.textContent = ''
      portraitSpec = null
      empty.style.display = ''
      return
    }
    empty.style.display = 'none'
    const spec = catalog[primary.specId]
    if (spec && portraitSpec !== spec.id) {
      portraitSlot.textContent = ''
      portraitSlot.appendChild(portraitEl(spec))
      portraitSpec = spec.id
    }

    const name = el('p', 'sel-name', detail)
    name.textContent = spec?.name ?? primary.specId
    const tags = el('p', 'sel-tags', detail)
    const mode = el('span', 'tag', tags)
    mode.textContent = primary.mode
    if (primary.policy) {
      const pol = el('span', 'tag tag-policy', tags)
      pol.textContent = primary.policy.kind
    }
    if (primary.uncontrolled) {
      const warn = el('span', 'tag tag-warn', tags)
      warn.appendChild(iconEl(ICONS.nolink, 'icon icon-s'))
      warn.appendChild(document.createTextNode('NO LINK'))
    }

    if (spec?.batteryWh) {
      const pct = Math.round((primary.batteryWh / spec.batteryWh) * 100)
      const b = bar(detail, 'battery', ICONS.battery)
      b.fill.style.width = `${pct}%`
      b.fill.classList.toggle('low', pct <= 25)
      b.value.textContent = `battery ${pct}%`
    }
    const hpPct = Math.round((primary.hp / primary.hpMax) * 100)
    const h = bar(detail, 'hull', ICONS.hp)
    h.fill.style.width = `${hpPct}%`
    h.fill.classList.toggle('low', hpPct <= 30)
    h.value.textContent = `hull ${hpPct}%`
    if (spec && spec.payloadKg > 0 && (spec.class === 'mining' || spec.class === 'cargo')) {
      const c = bar(detail, 'cargo', ICONS.cargo)
      const pct = Math.round((primary.cargoKg / spec.payloadKg) * 100)
      c.fill.style.width = `${pct}%`
      c.value.textContent = `cargo ${primary.cargoKg.toFixed(0)}/${spec.payloadKg} kg`
    }

    if (drones.length > 1) {
      const grouped = new Map<string, number>()
      for (const d of drones) grouped.set(d.specId, (grouped.get(d.specId) ?? 0) + 1)
      const groupRow = el('p', 'sel-group', detail)
      for (const [specId, count] of grouped) {
        const chipSpec = catalog[specId]
        const chip = el('span', 'group-chip', groupRow)
        if (chipSpec) chip.appendChild(iconEl(droneClassIcon(chipSpec.class), 'icon icon-s'))
        chip.appendChild(document.createTextNode(`x${count}`))
      }
    }
  })

  return () => {
    offView()
    offSel()
  }
}

function commandCard(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel command-card', root)
  const heading = el('h2', '', panel)
  heading.textContent = 'Orders'
  const grid = el('div', 'command-grid', panel)

  const buttons: HTMLButtonElement[] = []
  const order = (icon: string, label: string, onClick: () => void, danger = false) => {
    const b = button(`order-btn${danger ? ' danger' : ''}`, grid, label)
    b.appendChild(iconEl(icon))
    const t = el('span', 'order-label', b)
    t.textContent = label
    b.title = label
    b.disabled = true
    b.addEventListener('click', onClick)
    buttons.push(b)
    return b
  }

  order(ICONS.destruct, 'Kamikaze guard', () =>
    bus.emit('intent:policy', { kind: 'kamikazeOn', radiusM: 600 }),
  )
  order(ICONS.home, 'Return at 20%', () =>
    bus.emit('intent:policy', { kind: 'returnAtBatteryPct', pct: 20 }),
  )
  order(ICONS.hunt, 'Hunt quads', () =>
    bus.emit('intent:policy', { kind: 'huntClass', droneClass: 'multirotor' }),
  )
  order(ICONS.cancel, 'Clear policy', () => bus.emit('intent:policy', null))
  order(ICONS.skull, 'Self-destruct', () => bus.emit('intent:selfDestruct', null), true)

  const hint = el('p', 'command-hint', panel)
  hint.textContent = 'Right-click: move / attack / mine. Shift+1-9 stores a control group.'

  return bus.on('selection', (drones: DroneState[]) => {
    for (const b of buttons) b.disabled = drones.length === 0
  })
}

// -------------------------------------------------------------- eventlog --

function eventLog(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel event-log', root)
  panel.setAttribute('role', 'log')
  panel.setAttribute('aria-label', 'battle log')
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
      panel.prepend(line)
      while (panel.children.length > 9) panel.removeChild(panel.lastChild!)
    }
  })
}

// ------------------------------------------------------ banner and menus --

function matchBanner(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const overlay = el('div', 'overlay match-banner hidden', root)
  const inner = el('div', 'overlay-card', overlay)
  const text = el('h1', '', inner)
  const sub = el('p', 'banner-sub', inner)
  const row = el('div', 'overlay-actions', inner)
  const restart = button('primary-btn', row)
  restart.textContent = 'Play again'
  restart.addEventListener('click', () => bus.emit('intent:restart', null))
  const setup = button('ghost-btn', row)
  setup.textContent = 'Change setup'
  setup.addEventListener('click', () => bus.emit('intent:openMenu', null))
  return bus.on('view', (view: PlayerView) => {
    if (view.winner) {
      const won = view.winner === view.playerId
      text.textContent = won ? 'VICTORY' : 'DEFEAT'
      text.className = won ? 'win' : 'loss'
      sub.textContent = `CENTCOM ${won ? 'enemy' : 'friendly'} base destroyed after ${clockText(view.tick)}.`
      overlay.classList.remove('hidden')
    } else {
      overlay.classList.add('hidden')
    }
  })
}

function menuOverlay(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const overlay = el('div', 'overlay menu-overlay', root)
  const inner = el('div', 'overlay-card menu-card', overlay)
  const logo = el('div', 'menu-logo', inner)
  logo.appendChild(iconEl(droneClassIcon('multirotor'), 'menu-logo-icon'))
  const title = el('h1', 'menu-title', inner)
  title.textContent = 'DRONE OPTICONE'
  const tagline = el('p', 'menu-tagline', inner)
  tagline.textContent = 'Zero humans on the battlefield. Mine lithium, refine oil, build a real-spec drone swarm and hunt down the enemy CENTCOM.'

  const form = el('div', 'menu-form', inner)
  const diffLabel = el('p', 'menu-label', form)
  diffLabel.textContent = 'Enemy overlord'
  const diffRow = el('div', 'segmented', form)
  diffRow.setAttribute('role', 'radiogroup')
  diffRow.setAttribute('aria-label', 'difficulty')
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
  let difficulty = (params.get('difficulty') as 'easy' | 'normal' | 'hard') || 'normal'
  const diffButtons = new Map<string, HTMLButtonElement>()
  for (const d of ['easy', 'normal', 'hard'] as const) {
    const b = button('seg-btn', diffRow)
    b.textContent = d
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-checked', String(d === difficulty))
    b.addEventListener('click', () => {
      difficulty = d
      for (const [key, other] of diffButtons) other.setAttribute('aria-checked', String(key === d))
    })
    diffButtons.set(d, b)
  }

  const seedLabel = el('label', 'menu-label', form)
  seedLabel.textContent = 'Map seed (blank = random)'
  const seedInput = document.createElement('input')
  seedInput.type = 'text'
  seedInput.inputMode = 'numeric'
  seedInput.className = 'seed-input'
  seedInput.value = params.get('seed') ?? ''
  seedLabel.appendChild(seedInput)

  const deploy = button('primary-btn deploy-btn', form)
  deploy.textContent = 'Deploy'
  deploy.addEventListener('click', () => {
    const seed = Number(seedInput.value) || Math.floor(Math.random() * 2 ** 31)
    overlay.classList.add('hidden')
    bus.emit('intent:startMatch', { seed, difficulty })
  })

  const controls = el('div', 'menu-controls', inner)
  const ch = el('h2', '', controls)
  ch.textContent = 'Controls'
  const lines = [
    ['Left click / drag', 'select, box-select (shift adds)'],
    ['Right click', 'move, attack an enemy, mine a node'],
    ['WASD, arrows, screen edge', 'pan the camera'],
    ['Middle drag', 'rotate and tilt'],
    ['Left+right drag', 'grab-pan the map'],
    ['Wheel', 'zoom'],
    ['Shift+1..9 / 1..9', 'store and recall control groups (double tap centers)'],
    ['Satellite sweep', 'arm on the tactical map, then click the field'],
  ]
  const dl = el('dl', 'controls-list', controls)
  for (const [k, v] of lines) {
    const dt = el('dt', '', dl)
    dt.textContent = k!
    const dd = el('dd', '', dl)
    dd.textContent = v!
  }

  return bus.on('intent:openMenu', () => overlay.classList.remove('hidden'))
}

function systemButtons(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const wrap = el('div', 'system-buttons', root)
  const mute = button('sys-btn', wrap, 'toggle sound')
  mute.setAttribute('aria-pressed', 'false')
  mute.appendChild(iconEl(ICONS.sound))
  let muted = false
  mute.addEventListener('click', () => {
    muted = !muted
    mute.setAttribute('aria-pressed', String(muted))
    mute.replaceChildren(iconEl(muted ? ICONS.mute : ICONS.sound))
    bus.emit('intent:mute', muted)
  })

  const help = button('sys-btn', wrap, 'help')
  help.appendChild(iconEl(ICONS.help))
  const overlay = el('div', 'overlay help-overlay hidden', root)
  const card = el('div', 'overlay-card', overlay)
  const h = el('h1', '', card)
  h.textContent = 'Field manual'
  const body = el('div', 'help-body', card)
  body.innerHTML = `
    <p><strong>Goal.</strong> Destroy the enemy CENTCOM base before yours falls.</p>
    <p><strong>Economy.</strong> Ore miners harvest lithium crystals and oil seeps, the refinery cracks oil into airframe plastic, the factory turns lithium + plastic + credits into drones.</p>
    <p><strong>Combat.</strong> FPV quads and loitering munitions detonate on contact. The TB2 drops guided bombs from range. Watch the wind: over a drone's spec limit it drifts uncontrolled.</p>
    <p><strong>Control.</strong> Outside your CENTCOM/relay control range drones only follow standing orders (policies). Assign them from the Orders card.</p>
    <p><strong>Recon.</strong> Fog hides everything. Scouts, structures and satellite sweeps reveal the field.</p>`
  const close = button('primary-btn', card)
  close.textContent = 'Close'
  const toggle = () => overlay.classList.toggle('hidden')
  help.addEventListener('click', toggle)
  close.addEventListener('click', toggle)
  return () => {}
}

export function mountUI(root: HTMLElement, bus: Bus<ClientTopics>): UIHandle {
  const offs = [
    topbar(root, bus),
    buildMenu(root, bus),
    minimapPanel(root, bus),
    selectionPanel(root, bus),
    commandCard(root, bus),
    eventLog(root, bus),
    matchBanner(root, bus),
    menuOverlay(root, bus),
    systemButtons(root, bus),
  ]
  return { dispose: () => offs.forEach((off) => off()) }
}
