/**
 * The image-size ladder the config pane shows: three friendly tiers over the
 * pixel values the endpoint actually receives.
 *
 * The wire stays pixel-based (`1024x1024` …) — the tiers are presentation only,
 * so relaying the picked value needs no translation. Legacy sizes a config may
 * still hold (`1536x1024`, `512x512`) map to the nearest tier by longest edge;
 * ties keep the smaller tier so the UI never claims more pixels than stored.
 *
 * @module dsh-model-think-level/image/sizes
 */

/** One size tier: the label the picker shows and the value the wire gets. */
export interface ImageSizeTier {
  readonly label: '1K' | '2K' | '4K'
  readonly value: string
  /** The longest edge in pixels; also the sort order of the ladder. */
  readonly edge: number
}

/** The ladder, smallest first. The values are the wire's `size` strings. */
export const IMAGE_SIZE_TIERS: readonly ImageSizeTier[] = [
  { label: '1K', value: '1024x1024', edge: 1024 },
  { label: '2K', value: '2048x2048', edge: 2048 },
  { label: '4K', value: '4096x4096', edge: 4096 },
]

/** The longest edge of a `WxH` size, or undefined for anything else. */
export function longestEdge(size: string): number | undefined {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(size.trim())
  if (match === null) return undefined
  return Math.max(Number(match[1]), Number(match[2]))
}

/** The tier a stored size maps to (unparsable sizes read as the smallest). */
export function tierOfSize(size: string): ImageSizeTier {
  const edge = longestEdge(size)
  let best = IMAGE_SIZE_TIERS[0]!
  if (edge === undefined) return best
  let bestDistance = Number.POSITIVE_INFINITY
  for (const tier of IMAGE_SIZE_TIERS) {
    const distance = Math.abs(tier.edge - edge)
    if (distance < bestDistance) {
      best = tier
      bestDistance = distance
    }
  }
  return best
}

/** The picker text for a stored size (`1536x1024` → `1K`). */
export function sizeLabel(size: string): string {
  return tierOfSize(size).label
}

/** The canonical wire value for a stored size (`1536x1024` → `1024x1024`). */
export function canonicalSize(size: string): string {
  return tierOfSize(size).value
}
