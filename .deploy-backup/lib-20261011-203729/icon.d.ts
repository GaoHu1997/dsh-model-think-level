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
export declare const SVG_NS = "http://www.w3.org/2000/svg";
/** Marks a glyph, so the stylesheet can show one of several, and a sweep find it. */
export declare const ICON_ATTR = "data-bre-icon";
/** One outline path of a glyph, in the 16px viewBox. */
export declare function svgPath(d: string): SVGPathElement;
/** A stroke-only 16px glyph built from outline paths. */
export declare function svgGlyph(kind: string, paths: readonly string[]): SVGElement;
