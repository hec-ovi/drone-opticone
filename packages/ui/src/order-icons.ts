/**
 * Order-grid glyphs: filled, icon-only, readable at 20 px. Kept separate
 * from the general icon set so command-card changes stay local.
 */

/** Solid filled glyphs: bolder read at small sizes than stroked outlines. */
function fsvg(inner: string, viewBox = '0 0 24 24'): string {
  return `<svg viewBox="${viewBox}" fill="currentColor" stroke="none" aria-hidden="true">${inner}</svg>`
}

/**
 * Order glyphs for the command grid: filled, icon-only, readable at 20 px.
 */
export const ORDER_ICONS = {
  stop: fsvg('<rect x="6" y="6" width="12" height="12" rx="1.6"/>'),
  mine: fsvg(
    '<path d="M13.8 3.2c3.4-.4 6.1 1 7.4 3.1-1.9 0-3.8.5-5.3 1.7l-1.6 1.3-2.7-2.7 1.2-1.5c.6-.7.8-1.3 1-1.9Z"/><path d="m10.3 8 5.7 5.7-1.7 1.7-5.7-5.7Z"/><rect x="2.6" y="16.2" width="9" height="2.6" rx="1.3" transform="rotate(-45 7 17.6)"/>',
  ),
  guard: fsvg(
    '<path d="M12 2.6 20 6v5.2c0 4.9-3.4 8.5-8 10.2-4.6-1.7-8-5.3-8-10.2V6Z"/><circle cx="12" cy="11" r="3.2" fill="#0d141c"/><circle cx="12" cy="11" r="1.4"/>',
  ),
  home: fsvg('<path d="m12 3.4 9 7.2h-2.6v9h-4.8v-5.4H10.4v5.4H5.6v-9H3Z"/>'),
  hunt: fsvg(
    '<path d="M12 2a1.2 1.2 0 0 1 1.2 1.2v1.9a7 7 0 0 1 5.7 5.7h1.9a1.2 1.2 0 0 1 0 2.4h-1.9a7 7 0 0 1-5.7 5.7v1.9a1.2 1.2 0 0 1-2.4 0v-1.9a7 7 0 0 1-5.7-5.7H3.2a1.2 1.2 0 0 1 0-2.4h1.9a7 7 0 0 1 5.7-5.7V3.2A1.2 1.2 0 0 1 12 2Zm0 5.6A4.4 4.4 0 1 0 12 16.4 4.4 4.4 0 0 0 12 7.6Z"/><circle cx="12" cy="12" r="1.8"/>',
  ),
  clear: fsvg(
    '<path d="M12 2.8A9.2 9.2 0 1 1 2.8 12 9.2 9.2 0 0 1 12 2.8Zm-3.2 4.6L7.4 8.8 10.6 12l-3.2 3.2 1.4 1.4L12 13.4l3.2 3.2 1.4-1.4L13.4 12l3.2-3.2-1.4-1.4L12 10.6Z"/>',
  ),
  scuttle: fsvg(
    '<path d="M12 2.8a7.4 7.4 0 0 0-7.4 7.4c0 2.7 1.5 4.7 3.2 6v3h8.4v-3c1.7-1.3 3.2-3.3 3.2-6A7.4 7.4 0 0 0 12 2.8ZM9 12a1.7 1.7 0 1 1 1.7-1.7A1.7 1.7 0 0 1 9 12Zm6 0a1.7 1.7 0 1 1 1.7-1.7A1.7 1.7 0 0 1 15 12Z"/><rect x="9.6" y="19.8" width="1.8" height="2.4" rx="0.9"/><rect x="12.6" y="19.8" width="1.8" height="2.4" rx="0.9"/>',
  ),
  sweep: fsvg(
    '<rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1" transform="rotate(45 12 12)"/><path d="M4 6.2 6.2 4l3.2 3.2-2.2 2.2Zm12.6 10.4 2.2-2.2 3.2 3.2-2.2 2.2Z"/><path d="M14.6 14.6 18 18l-1 1-3.4-3.4Z"/><rect x="17.4" y="18.2" width="1.6" height="3.6" rx="0.8"/>',
  ),
}

