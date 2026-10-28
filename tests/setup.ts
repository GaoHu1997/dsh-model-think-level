import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach } from 'vitest'

import { resetWireMemories } from '../src/headers-pi-ai.js'
import { keyRest, resetRoutePlans } from '../src/key-route-core.js'

/**
 * Shared vitest setup, applied to every test file after its environment is
 * established.
 *
 * jsdom implements no canvas: every `getContext('2d')` call prints a
 * "Not implemented" error to the console before answering null. The
 * ComposerSlider's radiation effect already treats a null context as "draw
 * nothing" (the reduced-motion degradation path), so stubbing the method to
 * answer null up front keeps that exact path under test without one noise
 * line per mounted slider.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}

/**
 * The harness home defaults to the REAL `~/.dsh` when `DSH_HOME` is unset, and
 * the host's apply() now also syncs the image-generation config file there at
 * boot. A test run must never write into the user's own harness home, so an
 * unset DSH_HOME is pointed at a per-process temp dir first. Suites that need
 * a specific home (host.spec, key-index tests) set or pass their own paths.
 */
if (typeof process !== 'undefined' && !process.env['DSH_HOME']) {
  process.env['DSH_HOME'] = mkdtempSync(join(tmpdir(), 'bre-test-home-'))
}

/**
 * The key routing memories live for the length of a process, exactly as they do
 * in the host: a key that was charged a 401 stays benched, a model that a wire
 * served once keeps preferring it, and a wire that refused a model once is not
 * picked for it again. Tests must not inherit any of these facts from a sibling
 * test, so all are cleared before every test rather than relying on each suite
 * to use disjoint key refs.
 */
beforeEach(() => {
  keyRest.reset()
  resetWireMemories()
  resetRoutePlans()
})
