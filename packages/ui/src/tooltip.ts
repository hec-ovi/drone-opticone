import { el } from './dom'

/**
 * One shared cursor-following tooltip. Fixed-position, pointer-events off,
 * flips above/below the cursor so it never leaves the viewport and never
 * pushes layout around (the console sits at the screen bottom, so the
 * default is above the cursor).
 */

let tip: HTMLElement | null = null

function ensure(): HTMLElement {
  if (!tip || !document.body.contains(tip)) tip = el('div', 'cursor-tip', document.body)
  return tip
}

function place(ev: MouseEvent): void {
  const t = ensure()
  if (t.style.display === 'none' || t.style.display === '') return
  const pad = 14
  const r = t.getBoundingClientRect()
  let x = ev.clientX + pad
  let y = ev.clientY - r.height - pad
  if (y < 4) y = ev.clientY + pad + 8
  if (x + r.width > window.innerWidth - 4) x = Math.max(4, window.innerWidth - r.width - 4)
  t.style.left = `${x}px`
  t.style.top = `${y}px`
}

export function hideTooltip(): void {
  if (tip) tip.style.display = 'none'
}

/** Attach a cursor-following tooltip; the text callback runs on show. */
export function attachTooltip(target: HTMLElement, text: () => string): void {
  const show = (ev: MouseEvent) => {
    const s = text()
    if (!s) return
    const t = ensure()
    t.textContent = s
    t.style.display = 'block'
    place(ev)
  }
  target.addEventListener('mouseenter', show)
  target.addEventListener('mousemove', place)
  target.addEventListener('mouseleave', hideTooltip)
  // Keyboard focus: park it over the element instead of the cursor.
  target.addEventListener('focus', () => {
    const s = text()
    if (!s) return
    const t = ensure()
    t.textContent = s
    t.style.display = 'block'
    const r = target.getBoundingClientRect()
    const tr = t.getBoundingClientRect()
    t.style.left = `${Math.max(4, r.left + r.width / 2 - tr.width / 2)}px`
    t.style.top = `${Math.max(4, r.top - tr.height - 8)}px`
  })
  target.addEventListener('blur', hideTooltip)
}
