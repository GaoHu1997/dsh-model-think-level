/**
 * The plugin's own outline glyphs.
 *
 * Shared because two injected controls draw one: the API-key eye, which swaps
 * between two glyphs by attribute, and the key field's alias chip, which is
 * icon-only so that it does not repeat the official "API key" label with the
 * word for the same thing. Every glyph is a stroke-only outline on the same
 * 16px grid, inherits `currentColor`, and is hidden from assistive tech — the
 * button holding it carries the meaning in its own `aria-label`.
 *
 * @module dsh-model-think-level/client/injection/icon
 */

/** The namespace every SVG node here is created in. */
export const SVG_NS = 'http://www.w3.org/2000/svg'

/** Marks a glyph, so the stylesheet can show one of several, and a sweep find it. */
export const ICON_ATTR = 'data-bre-icon'

/** One outline path of a glyph, in the 16px viewBox. */
export function svgPath(d: string): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', d)
  return path
}

/** A stroke-only 16px glyph built from outline paths. */
export function svgGlyph(kind: string, paths: readonly string[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute(ICON_ATTR, kind)
  svg.append(...paths.map(svgPath))
  return svg
}
