/** Tiny DOM helpers shared by every panel. No state, no bus. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  parent.appendChild(node)
  return node
}

export function button(className: string, parent: HTMLElement, label?: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = className
  if (label) b.setAttribute('aria-label', label)
  parent.appendChild(b)
  return b
}

export function img(className: string, parent: HTMLElement, src?: string): HTMLImageElement {
  const node = document.createElement('img')
  node.alt = ''
  node.className = className
  if (src) node.src = src
  parent.appendChild(node)
  return node
}

export function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)
}

export function clockText(tick: number): string {
  const s = Math.floor(tick / 20)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
