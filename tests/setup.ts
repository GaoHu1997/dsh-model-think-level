import { beforeEach } from 'vitest'

import { resetServedWires } from '../src/headers-pi-ai.js'
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
 * The key routing memories live for the length of a process, exactly as they do
 * in the host: a key that was charged a 401 stays benched, and a model that a
 * wire served once keeps preferring it. Tests must not inherit either fact from
 * a sibling test, so both are cleared before every test rather than relying on
 * each suite to use disjoint key refs.
 */
beforeEach(() => {
  keyRest.reset()
  resetServedWires()
  resetRoutePlans()
})
