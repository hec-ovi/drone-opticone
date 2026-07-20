import {
  MARKET_LOT_KG,
  MARKET_RATE,
  POWER_EXPORT_RATE,
  type Bus,
  type ClientTopics,
  type PlayerView,
  type Selection,
} from '@opticone/shared'
import { ICONS, iconEl } from '../icons'
import { button, el, fmtPad } from '../dom'
import { attachTooltip } from '../tooltip'

const GOODS = [
  { resource: 'lithiumKg', label: 'Lithium', icon: 'lithium' },
  { resource: 'oilKg', label: 'Oil', icon: 'oil' },
  { resource: 'plasticKg', label: 'Plastic', icon: 'plastic' },
] as const

/**
 * Market panel, contextual on the selected own market: sell stockpiles in
 * fixed lots at the posted rates, and rent out grid surplus as exported
 * power for continuous credits. Everything closes during a brownout.
 */
export function marketPanel(root: HTMLElement, bus: Bus<ClientTopics>): () => void {
  const panel = el('section', 'panel market-panel', root)
  panel.style.display = 'none'

  const rows = el('div', 'market-rows', panel)
  const sellButtons = new Map<string, { btn: HTMLButtonElement; value: HTMLElement }>()
  for (const g of GOODS) {
    const row = el('div', 'market-row', rows)
    const badge = el('span', 'res-badge', row)
    badge.appendChild(iconEl(ICONS[g.icon]))
    const value = el('span', 'market-stock', row)
    const btn = button('market-sell', row, `Sell ${g.label.toLowerCase()}`)
    btn.textContent = `SELL ${MARKET_LOT_KG} · +${MARKET_LOT_KG * MARKET_RATE[g.resource]} cr`
    attachTooltip(
      btn,
      () =>
        `${g.label.toUpperCase()} · posted rate ${MARKET_RATE[g.resource]} cr/kg. Sells up to ${MARKET_LOT_KG} kg from the stockpile.`,
    )
    btn.addEventListener('click', () => {
      if (btn.classList.contains('locked')) return
      bus.emit('intent:sell', { resource: g.resource, kg: MARKET_LOT_KG })
    })
    sellButtons.set(g.resource, { btn, value })
  }

  const exportBtn = button('market-export', panel, 'Toggle power export')
  exportBtn.setAttribute('aria-pressed', 'false')
  attachTooltip(
    exportBtn,
    () =>
      `Rents your grid surplus to the market: ${POWER_EXPORT_RATE} cr/s per spare power unit, continuously. Building consumers shrinks the surplus automatically.`,
  )
  exportBtn.addEventListener('click', () => {
    bus.emit('intent:powerExport', exportBtn.getAttribute('aria-pressed') !== 'true')
  })

  const status = el('p', 'market-status', panel)

  let playerId = ''
  const offView = bus.on('view', (view: PlayerView) => {
    playerId = view.playerId
    const brownout = view.power.used > view.power.cap
    for (const g of GOODS) {
      const s = sellButtons.get(g.resource)!
      const stock = view.economy[g.resource]
      s.value.textContent = `${fmtPad(stock)} kg`
      const dead = brownout || stock < 1
      s.btn.classList.toggle('locked', dead)
      s.btn.setAttribute('aria-disabled', String(dead))
    }
    const surplus = Math.max(0, view.power.cap - view.power.used)
    exportBtn.setAttribute('aria-pressed', String(view.powerExport))
    exportBtn.textContent = view.powerExport
      ? `EXPORTING POWER · +${(surplus * POWER_EXPORT_RATE).toFixed(1)} cr/s`
      : `EXPORT POWER · surplus ${surplus}`
    exportBtn.classList.toggle('on', view.powerExport)
    status.textContent = brownout ? 'LOW POWER: market closed.' : ''
  })

  const offSel = bus.on('selection', (sel: Selection) => {
    const marketSelected = sel.structures.some((s) => s.kind === 'market' && s.playerId === playerId)
    panel.style.display = marketSelected ? '' : 'none'
  })

  return () => {
    offView()
    offSel()
  }
}
