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
import { el, fmt, img } from '../dom'
import { STRUCTURE_NAME } from '../display'
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
  const heading = el('h2', '', panel)
  heading.textContent = 'Construction'
  const grid = el('div', 'build-grid', panel)
  const info = el('p', 'build-info-strip', panel)
  const IDLE_HINT = 'Click a structure, then click the field to place it.'
  info.textContent = IDLE_HINT

  let lastView: PlayerView | null = null
  let placing: StructureKind | null = null

  const describe = (kind: StructureKind): string => {
    const build = STRUCTURE_BUILD[kind]!
    const power = POWER_CAP[kind] ? `+${POWER_CAP[kind]} power` : `-${POWER_USE[kind] ?? 0} power`
    const missing =
      lastView === null
        ? ''
        : lastView.economy.lithiumKg < build.lithiumKg
          ? ' | NEED LITHIUM'
          : lastView.economy.plasticKg < build.plasticKg
            ? ' | NEED PLASTIC'
            : lastView.economy.credits < build.credits
              ? ' | NEED CREDITS'
              : ''
    return `${STRUCTURE_NAME[kind]} | ${power} | ${fmt(build.lithiumKg)} li + ${fmt(build.plasticKg)} pl + ${fmt(build.credits)} cr | ${build.timeS}s${missing}`
  }

  const tiles = new Map<string, { btn: HTMLButtonElement; image: HTMLImageElement }>()
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
    const tag = el('span', 'tile-tag role-support', btn)
    tag.textContent = POWER_CAP[kind] ? 'PWR' : 'BLD'
    btn.title = STRUCTURE_NAME[kind]
    const show = () => {
      if (!placing) info.textContent = describe(kind)
    }
    btn.addEventListener('mouseenter', show)
    btn.addEventListener('focus', show)
    btn.addEventListener('click', () => bus.emit('intent:construct', { kind }))
    tiles.set(kind, { btn, image })
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
      const build = STRUCTURE_BUILD[kind]!
      const tile = tiles.get(kind)!
      tile.btn.disabled =
        view.economy.lithiumKg < build.lithiumKg ||
        view.economy.plasticKg < build.plasticKg ||
        view.economy.credits < build.credits
    }
  })

  const offPlace = bus.on('placeModeChanged', (kind: StructureKind | null) => {
    placing = kind
    for (const [k, tile] of tiles) tile.btn.classList.toggle('placing', k === kind)
    info.textContent = kind
      ? `Placing ${STRUCTURE_NAME[kind]}: click the field. Right-click or Esc cancels.`
      : IDLE_HINT
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
