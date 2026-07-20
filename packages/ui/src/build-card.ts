import { ICONS, iconEl } from './icons'
import { el, fmt } from './dom'
import { attachTooltip } from './tooltip'

/**
 * Hover card under the build/construction grids: what the tile is, what it
 * does, then every resource as "need / have" (green covered, red short),
 * the build time, and the dependency buildings as icon chips. Every chip
 * carries a cursor tooltip naming the resource and how to get it.
 */

export interface CardCost {
  icon: string
  label: string
  need: number
  have: number
  /** how to obtain this resource, appended to the chip tooltip when short */
  hint?: string
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
  // Rebuild only when something shown actually changed, so chips under the
  // cursor are not replaced every tick and their tooltips stay stable.
  let shownJson = ''

  return {
    clear() {
      shownJson = ''
      card.classList.remove('on')
      name.textContent = ''
      desc.textContent = ''
      costs.textContent = ''
      deps.textContent = ''
    },
    show(d) {
      const json = JSON.stringify(d, (_k, v) => (typeof v === 'number' ? Math.round(v) : v))
      if (json === shownJson) return
      shownJson = json
      card.classList.add('on')
      name.textContent = d.name
      desc.textContent = d.desc
      costs.textContent = ''
      for (const c of d.costs) {
        const short = c.have < c.need
        const chip = el('span', `bc-cost ${short ? 'short' : 'ok'}`, costs)
        chip.appendChild(iconEl(c.icon, 'icon icon-s'))
        chip.appendChild(document.createTextNode(`${fmt(c.need)} / ${fmt(c.have)}`))
        attachTooltip(
          chip,
          () =>
            `${c.label.toUpperCase()} · needs ${fmt(c.need)}, you have ${fmt(c.have)}.` +
            (short ? ` SHORT by ${fmt(c.need - c.have)}.` : '') +
            (c.hint ? ` ${c.hint}` : ''),
        )
      }
      if (d.bonus) {
        const b = el('span', 'bc-cost ok', costs)
        b.appendChild(iconEl(ICONS.power, 'icon icon-s'))
        b.appendChild(document.createTextNode(d.bonus))
        attachTooltip(b, () => 'POWER · added to the grid cap once built.')
      }
      if (d.timeS !== undefined) {
        const t = el('span', 'bc-cost', costs)
        t.appendChild(iconEl(ICONS.clock, 'icon icon-s'))
        t.appendChild(document.createTextNode(`${d.timeS}s`))
        attachTooltip(t, () => 'BUILD TIME · seconds of work once the job starts.')
      }
      deps.textContent = ''
      for (const dep of d.deps) {
        const chip = el('span', 'bc-dep', deps)
        chip.appendChild(iconEl(dep.icon, 'icon icon-s'))
        attachTooltip(chip, () => dep.title)
      }
    },
  }
}
