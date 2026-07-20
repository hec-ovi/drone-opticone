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
  const grid = el('div', 'build-grid', panel)
  const info = el('p', 'build-info-strip', panel)
  const IDLE_HINT = 'Pick a structure, then click the field.'
  info.textContent = IDLE_HINT

  let lastView: PlayerView | null = null
  let placing: StructureKind | null = null

  const shortfall = (kind: StructureKind): string | null => {
    if (!lastView) return null
    const build = STRUCTURE_BUILD[kind]!
    if (lastView.economy.lithiumKg < build.lithiumKg) return 'NEED LITHIUM'
    if (lastView.economy.plasticKg < build.plasticKg) return 'NEED PLASTIC'
    if (lastView.economy.credits < build.credits) return 'NEED CREDITS'
    return null
  }

  const describe = (kind: StructureKind): string => {
    const build = STRUCTURE_BUILD[kind]!
    const power = POWER_CAP[kind] ? `+${POWER_CAP[kind]} power` : `-${POWER_USE[kind] ?? 0} power`
    const missing = shortfall(kind)
    return `${STRUCTURE_NAME[kind]} · ${power} · ${fmt(build.lithiumKg)} li + ${fmt(build.plasticKg)} pl + ${fmt(build.credits)} cr · ${build.timeS}s${missing ? ` · ${missing}` : ''}`
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
    btn.title = STRUCTURE_NAME[kind]
    const show = () => {
      if (!placing) info.textContent = describe(kind)
    }
    btn.addEventListener('mouseenter', show)
    btn.addEventListener('focus', show)
    btn.addEventListener('mouseleave', () => {
      if (!placing) info.textContent = IDLE_HINT
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
