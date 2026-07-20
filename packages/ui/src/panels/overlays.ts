import type { Bus, ClientTopics, PlayerView } from '@opticone/shared'
import { droneClassIcon, iconEl } from '../icons'
import { button, clockText, el } from '../dom'

/** Victory / defeat screen with restart and setup actions. */
export function matchBanner(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
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

/** Start menu: difficulty, seed, deploy, controls reference. */
export function menuOverlay(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const overlay = el('div', 'overlay menu-overlay', root)
  const inner = el('div', 'overlay-card menu-card', overlay)
  const logo = el('div', 'menu-logo', inner)
  logo.appendChild(iconEl(droneClassIcon('multirotor'), 'menu-logo-icon'))
  const title = el('h1', 'menu-title', inner)
  title.textContent = 'DRONE OPTICONE'
  const tagline = el('p', 'menu-tagline', inner)
  tagline.textContent =
    'Zero humans on the battlefield. Mine lithium, refine oil, build a real-spec drone swarm and hunt down the enemy CENTCOM.'

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
    ['Left click / drag', 'select units, buildings, nodes; box-select (shift adds)'],
    ['Right click', 'move, attack an enemy, mine a node'],
    ['Right drag', 'pan the map (also WASD, arrows, screen edge)'],
    ['Middle drag', 'rotate and tilt'],
    ['Wheel', 'zoom'],
    ['Shift+1..9 / 1..9', 'store and recall control groups (double tap centers)'],
    ['Satellite sweep', 'arm on the map or order grid, then click the field'],
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
