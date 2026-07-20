import {
  POWER_CAP,
  POWER_USE,
  STRUCTURE_BUILD,
  type Bus,
  type ClientTopics,
  type PlayerView,
  type Selection,
  type StructureKind,
  type ThumbnailSet,
} from '@opticone/shared'
import { el, img } from '../dom'
import { ICONS } from '../icons'
import { buildInfoCard, type CardData } from '../build-card'
import { STRUCTURE_DESC, STRUCTURE_NAME } from '../display'
import { structurePortraitSvg } from '../portraits'

const BUILDABLE = Object.keys(STRUCTURE_BUILD) as StructureKind[]

/**
 * Construction panel, C&C style: contextual on the selected CENTCOM. Click a
 * structure tile, then click the field to place it (the scene shows a
 * green/red footprint ghost; right-click cancels). Costs come from the same
 * shared table the sim enforces.
 */
export function constructionMenu(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel build-menu construct-menu', root)
  panel.style.display = 'none'
  const grid = el('div', 'build-grid', panel)
  const card = buildInfoCard(panel)

  let lastView: PlayerView | null = null
  let placing: StructureKind | null = null
  let hoveredKind: StructureKind | null = null

  const shortfall = (kind: StructureKind): string | null => {
    if (!lastView) return null
    const build = STRUCTURE_BUILD[kind]!
    if (lastView.economy.lithiumKg < build.lithiumKg) return 'NEED LITHIUM'
    if (lastView.economy.plasticKg < build.plasticKg) return 'NEED PLASTIC'
    if (lastView.economy.credits < build.credits) return 'NEED CREDITS'
    return null
  }

  const cardFor = (kind: StructureKind, view: PlayerView): CardData => {
    const build = STRUCTURE_BUILD[kind]!
    const draw = POWER_USE[kind]
    const costs: CardData['costs'] = [
      { icon: ICONS.lithium, need: build.lithiumKg, have: view.economy.lithiumKg },
      { icon: ICONS.plastic, need: build.plasticKg, have: view.economy.plasticKg },
      { icon: ICONS.credits, need: build.credits, have: view.economy.credits },
    ]
    // Consumers show their power draw against the grid headroom.
    if (draw) costs.push({ icon: ICONS.power, need: draw, have: Math.max(0, view.power.cap - view.power.used) })
    return {
      name: STRUCTURE_NAME[kind],
      desc: STRUCTURE_DESC[kind],
      costs,
      timeS: build.timeS,
      bonus: POWER_CAP[kind] ? `+${POWER_CAP[kind]} power` : undefined,
      deps: [{ icon: ICONS.base, title: 'Placed from the CENTCOM' }],
    }
  }

  const tiles = new Map<string, { btn: HTMLButtonElement; image: HTMLImageElement; tag: HTMLElement; roleTag: string }>()
  for (const kind of BUILDABLE) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'build-tile structure-tile'
    btn.setAttribute('aria-label', `Construct ${STRUCTURE_NAME[kind]}`)
    grid.appendChild(btn)
    const image = img('tile-img', btn)
    image.style.display = 'none'
    const fallback = el('span', 'tile-fallback tile-structure-art', btn)
    fallback.innerHTML = structurePortraitSvg(kind)
    const roleTag = POWER_CAP[kind] ? 'PWR' : kind === 'air-defense' ? 'DEF' : 'BLD'
    const tag = el('span', 'tile-tag role-support', btn)
    tag.textContent = roleTag
    const show = () => {
      hoveredKind = kind
      if (!placing && lastView) card.show(cardFor(kind, lastView))
    }
    btn.addEventListener('mouseenter', show)
    btn.addEventListener('focus', show)
    btn.addEventListener('mouseleave', () => {
      if (hoveredKind === kind) hoveredKind = null
      if (!placing) card.clear()
    })
    btn.addEventListener('click', () => {
      if (btn.classList.contains('locked')) return
      bus.emit('intent:construct', { kind })
    })
    tiles.set(kind, { btn, image, tag, roleTag })
  }

  const offThumbs = bus.on('thumbnails', (t: ThumbnailSet) => {
    for (const [kind, tile] of tiles) {
      const src = t.structures[kind]
      if (src) {
        tile.image.src = src
        tile.image.style.display = ''
        tile.btn.querySelector('.tile-fallback')?.remove()
      }
    }
  })

  let playerId = ''
  const offView = bus.on('view', (view: PlayerView) => {
    lastView = view
    playerId = view.playerId
    for (const kind of BUILDABLE) {
      const tile = tiles.get(kind)!
      const missing = shortfall(kind)
      tile.btn.classList.toggle('locked', missing !== null)
      tile.btn.setAttribute('aria-disabled', String(missing !== null))
      tile.tag.textContent = missing ?? tile.roleTag
      tile.tag.classList.toggle('warn', missing !== null)
    }
    if (!placing && hoveredKind) card.show(cardFor(hoveredKind, view))
  })

  const offPlace = bus.on('placeModeChanged', (kind: StructureKind | null) => {
    placing = kind
    for (const [k, tile] of tiles) tile.btn.classList.toggle('placing', k === kind)
    if (kind) {
      card.show({
        name: STRUCTURE_NAME[kind],
        desc: 'Placing: click the field. Right-click or Esc cancels.',
        costs: [],
        deps: [],
      })
    } else {
      card.clear()
    }
  })

  const offSel = bus.on('selection', (sel: Selection) => {
    const centcomSelected = sel.structures.some((s) => s.kind === 'centcomm' && s.playerId === playerId)
    panel.style.display = centcomSelected ? '' : 'none'
  })

  return () => {
    offView()
    offThumbs()
    offPlace()
    offSel()
  }
}
