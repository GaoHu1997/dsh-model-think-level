/**
 * Make a wire-protocol switch and its compat cleanup ONE write.
 *
 * The kernel validates a whole settings document at the moment it is written
 * (`llm-pi-ai`'s `assertServiceable` -> `resolveModelCompat`): a model that
 * still carries a switch its NEW protocol does not take fails resolution, and
 * the write is refused outright --
 *
 *   provider "free" model "gpt-6.1-sol" sets compat "supportsReasoningEffort",
 *   but its api is "openai-responses", which does not take it
 *
 * -- so the official card's Save bounces and the user is left to hand-edit
 * `cordis.patch.yml`. The boot sweep and the idle pass heal that state
 * afterwards, which is too late: the refusal already happened.
 *
 * The fix has to land INSIDE the same mutate call, because a separate write
 * either races the card's frozen revision (issue #7: the user's own Save then
 * fails with `settings/conflict`) or arrives after the refusal. This module is
 * the pure half of that: given the ops a caller is about to send and the
 * providers dict they apply to, it returns the ops with the now-foreign compat
 * switches stripped from every model (and route compat block) the same write
 * moves to a different protocol.
 *
 * Pure data logic -- no harness package, no DOM -- so it is unit-testable and
 * shared by the write seam alone.
 *
 * @module dsh-model-think-level/compat-write
 */

import { stripForeignCompat } from './knowledge.js'
import { isRecord } from './shared.js'

/** A JSON object, as the settings document stores one. */
type JsonObject = Record<string, unknown>

/** The path-addressed edit shape the settings remote takes. */
export type WriteOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

/**
 * Whether two op paths name the same place. The settings layer treats a path as
 * an address, so `['providers','free','models']` and the same array built by a
 * different caller are one target.
 */
function samePath(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((segment, index) => segment === right[index])
}

/**
 * Strip the switches a protocol does not take from one compat block.
 * @returns the cleaned block, or undefined when nothing had to go.
 */
function cleanCompat(compat: unknown, api: string): JsonObject | undefined {
  if (!isRecord(compat)) return undefined
  return stripForeignCompat(compat, api)
}

/**
 * Clean one models array against a protocol.
 * @returns the rebuilt array, or undefined when every row already fits.
 */
function cleanModels(models: unknown, api: string): unknown[] | undefined {
  if (!Array.isArray(models) || models.length === 0) return undefined
  let changed = false
  const next = models.map((row) => {
    // A row this code cannot represent rides along verbatim: the array is
    // rebuilt whole, never silently shortened (the same rule the boot sweep
    // and the idle guard follow).
    if (!isRecord(row)) return row
    const cleaned = cleanCompat(row['compat'], api)
    if (cleaned === undefined) return row
    changed = true
    return { ...row, compat: cleaned }
  })
  return changed ? next : undefined
}

/**
 * Clean a whole route profile against the protocol it now names.
 * @returns the rebuilt profile, or undefined when nothing had to go.
 */
function cleanProfile(profile: JsonObject, api: string): JsonObject | undefined {
  let changed = false
  const next: JsonObject = { ...profile }
  const routeCompat = cleanCompat(profile['compat'], api)
  if (routeCompat !== undefined) {
    next['compat'] = routeCompat
    changed = true
  }
  const models = cleanModels(profile['models'], api)
  if (models !== undefined) {
    next['models'] = models
    changed = true
  }
  return changed ? next : undefined
}

/**
 * Whether this write moves any route to a different wire protocol.
 *
 * The cheap gate in front of {@link withCompatCleanup}: a write that leaves
 * `api` alone cannot make an already-valid document invalid, so the caller
 * skips the document read entirely. Exported because the write seam asks it
 * before paying for a describe.
 * @param ops - the ops a caller is about to send.
 */
export function protocolsSwitched(ops: readonly WriteOp[]): boolean {
  return protocolsMoved(ops).size > 0
}

/**
 * The protocol each op moves a route TO, keyed by route.
 *
 * Only ops that actually name a protocol count: a write that leaves `api`
 * alone cannot make an already-valid document invalid, and cleaning it would
 * be an unrequested edit of switches the user set by hand.
 */
function protocolsMoved(ops: readonly WriteOp[]): Map<string, string> {
  const moved = new Map<string, string>()
  for (const op of ops) {
    if (op.op !== 'set') continue
    const path = op.path
    if (path[0] !== 'providers' || path.length < 3 || path.length > 3) continue
    const route = path[1]
    if (route === undefined) continue
    if (path[2] === 'api' && typeof op.value === 'string' && op.value.length > 0) {
      moved.set(route, op.value)
      continue
    }
  }
  // A profile-level write (`providers.<route>` = { ... }) names its protocol
  // inside the value instead of on the path -- the add-provider card saves that
  // way, and it is exactly the write that creates a route with switches on it.
  for (const op of ops) {
    if (op.op !== 'set') continue
    if (op.path[0] !== 'providers' || op.path.length !== 2) continue
    const route = op.path[1]
    if (route === undefined || !isRecord(op.value)) continue
    const api = op.value['api']
    if (typeof api === 'string' && api.length > 0) moved.set(route, api)
  }
  return moved
}

/**
 * Add the compat cleanup a protocol switch needs to the SAME write.
 *
 * For every route this write moves to a different protocol, the switches its
 * models (and its route-level compat block) can no longer carry are stripped:
 *
 *  - an op that already replaces the models array is cleaned in place, so the
 *    write still says exactly what its caller meant, minus the dead switches;
 *  - an op that replaces the whole profile is cleaned the same way;
 *  - otherwise a `set` on `providers.<route>.models` (and on the route compat
 *    block, when it carries one) is APPENDED, so the caller's own fields stay
 *    untouched and the cleanup travels in the same revision.
 *
 * @param ops - the ops the caller is about to send.
 * @param providers - the user-layer providers dict they apply to.
 * @returns the ops to send: the originals when no protocol moved or nothing
 *   needed cleaning, otherwise the cleaned/expanded set.
 */
export function withCompatCleanup(ops: readonly WriteOp[], providers: unknown): WriteOp[] {
  const moved = protocolsMoved(ops)
  if (moved.size === 0) return [...ops]
  const routes = isRecord(providers) ? providers : {}
  const out: WriteOp[] = ops.map(op => (op.op === 'set'
    ? { op: 'set', path: [...op.path], value: op.value }
    : { op: 'unset', path: [...op.path] }))
  // Whether this call repaired anything. A write can be repaired WITHOUT
  // growing (the caller's own op is cleaned in place) or by appending, and only
  // "neither" is the untouched pass-through the callers rely on.
  let changed = false
  for (const [route, api] of moved) {
    const profilePath = ['providers', route]
    const modelsPath = ['providers', route, 'models']
    const compatPath = ['providers', route, 'compat']
    // A whole-profile write already carries the models: clean them there so the
    // caller's one op stays one op (appending a models set beside it would send
    // the same array twice and invite an ordering question).
    const profileOp = out.find(op => op.op === 'set' && samePath(op.path, profilePath))
    if (profileOp !== undefined && profileOp.op === 'set' && isRecord(profileOp.value)) {
      const cleaned = cleanProfile(profileOp.value, api)
      if (cleaned !== undefined) {
        profileOp.value = cleaned
        changed = true
      }
      continue
    }
    // Route-level switches first, then the rows -- the order the compat guard's
    // patch uses, so two code paths repairing the same document write the same
    // op sequence.
    const compatOp = out.find(op => op.op === 'set' && samePath(op.path, compatPath))
    if (compatOp !== undefined && compatOp.op === 'set') {
      const cleaned = cleanCompat(compatOp.value, api)
      if (cleaned !== undefined) {
        compatOp.value = cleaned
        changed = true
      }
    } else {
      const stored = isRecord(routes[route]) ? (routes[route] as JsonObject)['compat'] : undefined
      const cleaned = cleanCompat(stored, api)
      if (cleaned !== undefined) {
        out.push({ op: 'set', path: compatPath, value: cleaned })
        changed = true
      }
    }
    const modelsOp = out.find(op => op.op === 'set' && samePath(op.path, modelsPath))
    if (modelsOp !== undefined && modelsOp.op === 'set') {
      const cleaned = cleanModels(modelsOp.value, api)
      if (cleaned !== undefined) {
        modelsOp.value = cleaned
        changed = true
      }
    } else {
      const stored = isRecord(routes[route]) ? (routes[route] as JsonObject)['models'] : undefined
      const cleaned = cleanModels(stored, api)
      if (cleaned !== undefined) {
        out.push({ op: 'set', path: modelsPath, value: cleaned })
        changed = true
      }
    }
  }
  // Nothing was dirty: hand back the caller's own ops untouched, so a switch
  // between two protocols that take the same switches costs no extra field.
  return changed ? out : [...ops]
}
