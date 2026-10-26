/**
 * Bounded reaction to pushed invalidations.
 *
 * The settings host does not send one "the document changed" per change: it
 * emits `settings/document-updated` per entry, and it emits again whenever a
 * `describe()` observes the serialized document move. Anything a refresh does
 * -- a scan's describe, an idle fill's write -- can therefore come back as
 * another notification. A client that runs one refresh per notification has an
 * unbounded feedback loop, and the renderer starves: opening the Models page
 * froze the entire DSH exactly this way.
 *
 * This turns a burst into ONE refresh and caps the rate however chatty the host
 * becomes. The cost is that a change is noticed at most a beat later; the gain
 * is that the page always settles.
 */

/** The face the push handlers drive. */
export interface RefreshScheduler {
  /** Ask for a refresh. Cheap, idempotent, and safe from inside a refresh. */
  schedule: () => void
  /** Cancel any pending refresh and stop accepting new ones. */
  dispose: () => void
}

/**
 * Build a coalescing, rate-limited scheduler around one `refresh` unit of work.
 * @param refresh - the work to run; called at most once per interval.
 * @param minIntervalMs - floor between two runs.
 * @returns the {@link RefreshScheduler} face.
 */
export function createRefreshScheduler(
  refresh: () => void,
  minIntervalMs: number,
): RefreshScheduler {
  let scheduled = false
  let lastRun = 0
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    schedule: (): void => {
      if (closed || scheduled) return
      scheduled = true
      const delay = Math.max(0, minIntervalMs - (Date.now() - lastRun))
      timer = setTimeout(() => {
        timer = undefined
        scheduled = false
        lastRun = Date.now()
        if (!closed) refresh()
      }, delay)
    },
    dispose: (): void => {
      closed = true
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      scheduled = false
    },
  }
}
