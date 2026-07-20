import { ICONS, iconEl } from './icons'
import { el, fmt } from './dom'

/**
 * Hover card under the build/construction grids: what the tile is, what it
 * does, then every resource as "need / have" (green covered, red short),
 * the build time, and the dependency buildings as icon chips.
 */

export interface CardCost {
  icon: string
  need: number
  have: number
}

export interface CardData {
  name: string
  desc: string
  costs: CardCost[]
  timeS?: number
  /** extra always-green chip, e.g. '+60 power' on the power plant */
  bonus?: string
  deps: { icon: string; title: string }[]
}

export interface InfoCard {
  show(d: CardData): void
  clear(): void
}

export function buildInfoCard(parent: HTMLElement): InfoCard {
  const card = el('div', 'build-card', parent)
  const name = el('p', 'bc-name', card)
  const desc = el('p', 'bc-desc', card)
  const costs = el('div', 'bc-costs', card)
  const deps = el('div', 'bc-deps', card)

  return {
    clear() {
      card.classList.remove('on')
      name.textContent = ''
      desc.textContent = ''
      costs.textContent = ''
      deps.textContent = ''
    },
    show(d) {
      card.classList.add('on')
      name.textContent = d.name
      desc.textContent = d.desc
      costs.textContent = ''
      for (const c of d.costs) {
        const chip = el('span', `bc-cost ${c.have >= c.need ? 'ok' : 'short'}`, costs)
        chip.appendChild(iconEl(c.icon, 'icon icon-s'))
        chip.appendChild(document.createTextNode(`${fmt(c.need)} / ${fmt(c.have)}`))
      }
      if (d.bonus) {
        const b = el('span', 'bc-cost ok', costs)
        b.appendChild(iconEl(ICONS.power, 'icon icon-s'))
        b.appendChild(document.createTextNode(d.bonus))
      }
      if (d.timeS !== undefined) {
        const t = el('span', 'bc-cost', costs)
        t.appendChild(iconEl(ICONS.clock, 'icon icon-s'))
        t.appendChild(document.createTextNode(`${d.timeS}s`))
      }
      deps.textContent = ''
      for (const dep of d.deps) {
        const chip = el('span', 'bc-dep', deps)
        chip.title = dep.title
        chip.appendChild(iconEl(dep.icon, 'icon icon-s'))
      }
    },
  }
}
