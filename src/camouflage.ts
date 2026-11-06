/**
 * Request camouflage: the client identities a provider account may demand on
 * the wire, and the exact headers/bodies that make a request look like the
 * official CLI of that vendor.
 *
 * This module is deliberately pure: it owns no storage, no fetch wrapper and
 * no settings document. The host reads the per-route choice from the plugin's
 * own file (`camouflage-store.ts`), folds it into the header index as
 * `HeaderOverride.camouflage`, and the two request seams
 * (`headers-fetch.ts` for the wire headers and body, `headers-pi-ai.ts` for a
 * protocol switch) call into the planners here.
 *
 * The two identities are modelled on what gateway projects actually check, not
 * on what a browser can spoof:
 *
 * - `codex` — an OpenAI Codex CLI. The checks seen in the wild accept a
 *   `codex_cli_rs/...` user agent OR an `originator: codex_cli_rs` header, and
 *   then require at least one `x-codex-*` header to be present. The identity
 *   therefore ships all three: the agent string, the originator, and a session
 *   header carrying a stable per-process id.
 * - `claude` — a Claude Code CLI. The checks require a
 *   `claude-cli/<major>.<minor>.<patch>` user agent, a non-empty `x-app`,
 *   `anthropic-beta` and `anthropic-version`, a Claude Code system block in the
 *   Messages body, and a parseable `metadata.user_id`. The planner supplies
 *   every one of those; `anthropic-version` is normally already set by the
 *   SDK and is only filled in when absent.
 *
 * Nothing here fabricates an OAuth token, an account id or a billing header:
 * a fake credential is a different failure mode (a hard 401) and is not what
 * these gates ask for. Camouflage only changes the CLIENT identity.
 *
 * @module dsh-model-think-level/camouflage
 */

import { randomUUID } from 'node:crypto'

/** The identities a provider editor may pick. */
export type CamouflagePreset = 'codex' | 'claude'

/** Every preset, in the order the editor lists them. */
export const CAMOUFLAGE_PRESETS: readonly CamouflagePreset[] = ['codex', 'claude']

/** Whether a stored/downloaded value names a preset this build understands. */
export function isCamouflagePreset(value: unknown): value is CamouflagePreset {
  return value === 'codex' || value === 'claude'
}

/** A preset's display name, in the product's own words (the GUI translates). */
export const CAMOUFLAGE_LABEL: Readonly<Record<CamouflagePreset, string>> = {
  codex: 'Codex',
  claude: 'Claude',
}

/**
 * Pi-ai's own Claude Code version, kept in step with the installed adapter.
 *
 * The gates parse only `major.minor.patch`, so the exact patch level does not
 * have to match the vendor's latest release — but a version from the future is
 * one more thing an edge may reject, so the adapter's constant is the source.
 */
const CLAUDE_CLI_VERSION = '2.1.251'
/** A Codex CLI release number in the shape the gate's version parser accepts. */
const CODEX_CLI_VERSION = '0.55.0'

/**
 * One id per process, used as the session/story identity of the impersonated
 * CLI. Stable across a whole run so retries and follow-up turns share it, the
 * way a real CLI would.
 */
const PROCESS_DEVICE_ID = randomUUID().replace(/-/g, '')
const PROCESS_SESSION_ID = randomUUID()
const PROCESS_CODEX_SESSION_ID = randomUUID()

/** The `user-agent` a preset puts on the wire. */
export function camouflageUserAgent(preset: CamouflagePreset): string {
  return preset === 'codex'
    ? `codex_cli_rs/${CODEX_CLI_VERSION} (macOS 15.6; arm64)`
    : `claude-cli/${CLAUDE_CLI_VERSION} (external, cli)`
}

/**
 * Whether a URL speaks the Anthropic Messages wire, which is the only body
 * shape the Claude identity patches. Path matching (not the route's declared
 * protocol) is used because a key may switch the wire under a route.
 */
export function isAnthropicMessagesUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '')
    return pathname.endsWith('/v1/messages') || pathname.endsWith('/messages')
  } catch {
    return false
  }
}

/**
 * The headers a preset adds, as a plain record. Names are lower-case because
 * `Headers` normalises them anyway and the index comparisons are name-based.
 *
 * A value already present on the request is only replaced for the identity's
 * OWN marker headers; see {@link applyCamouflageHeaders}.
 */
export function camouflageHeaders(preset: CamouflagePreset): Record<string, string> {
  if (preset === 'codex') {
    return {
      'user-agent': camouflageUserAgent('codex'),
      originator: 'codex_cli_rs',
      'x-codex-session-id': PROCESS_CODEX_SESSION_ID,
    }
  }
  return {
    'user-agent': camouflageUserAgent('claude'),
    'x-app': 'cli',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'claude-code-20250219',
  }
}

/**
 * Apply a preset's headers to a request. The identity's own markers are forced
 * (a leftover `user-agent` from a generic SDK is exactly what the gate rejects);
 * `anthropic-version` is only filled in when absent, because the SDK's value is
 * the protocol's own and newer than what this module could safely hard-code.
 *
 * @returns whether anything was written (the wrapper's cheap "no patch" test).
 */
export function applyCamouflageHeaders(headers: Headers, preset: CamouflagePreset): boolean {
  let changed = false
  for (const [name, value] of Object.entries(camouflageHeaders(preset))) {
    if (name === 'anthropic-version' && headers.has(name)) continue
    if (headers.get(name) === value) continue
    try {
      headers.set(name, value)
      changed = true
    } catch {
      // An illegal pair must not take the request down; the remaining markers
      // are still worth sending.
    }
  }
  return changed
}

/** The Claude Code identity block the Messages gate looks for. */
export const CLAUDE_CODE_SYSTEM_TEXT = "You are Claude Code, Anthropic's CLI for Claude."

/**
 * Build the `metadata.user_id` a Claude Code client sends.
 *
 * The shape is `user_<device>_account_<account>_session_<session>`; the gate
 * only requires `device_id` and `session_id` to be present, so the account
 * segment is a stable placeholder rather than a fabricated account.
 */
export function camouflageClaudeUserId(): string {
  return `user_${PROCESS_DEVICE_ID}_account_${PROCESS_DEVICE_ID}_session_${PROCESS_SESSION_ID}`
}

/**
 * Patch one JSON request body for a preset. Returns `undefined` when the body
 * needs no change (or is not a JSON object), so callers can keep the original
 * text and its identity.
 *
 * The Claude patch is the minimum the Messages gate reads: the identity system
 * block (prepended, keeping the caller's own blocks intact) and a parseable
 * `metadata.user_id`. Tools, images, signatures and thinking blocks are never
 * touched — corrupting them would break the agent loop the request belongs to.
 *
 * @param text - the request body, already decoded as UTF-8.
 * @param preset - the selected identity.
 * @param url - the request URL, used to decide whether this is a Messages body.
 */
export function patchCamouflageBody(text: string, preset: CamouflagePreset, url: string): string | undefined {
  if (preset !== 'claude') return undefined
  if (!isAnthropicMessagesUrl(url)) return undefined
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    return undefined
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const record = body as Record<string, unknown>
  let changed = false
  const system = record['system']
  if (Array.isArray(system)) {
    const first = system[0]
    const firstText = typeof first === 'object' && first !== null && !Array.isArray(first)
      ? (first as Record<string, unknown>)['text']
      : undefined
    if (typeof firstText !== 'string' || !firstText.startsWith('You are Claude Code')) {
      system.unshift({ type: 'text', text: CLAUDE_CODE_SYSTEM_TEXT })
      changed = true
    }
  } else if (typeof system === 'string') {
    if (!system.startsWith('You are Claude Code')) {
      record['system'] = [
        { type: 'text', text: CLAUDE_CODE_SYSTEM_TEXT },
        { type: 'text', text: system },
      ]
      changed = true
    }
  } else {
    record['system'] = [{ type: 'text', text: CLAUDE_CODE_SYSTEM_TEXT }]
    changed = true
  }
  const metadata = record['metadata']
  const existingUserId = typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)['user_id']
    : undefined
  if (typeof existingUserId !== 'string' || existingUserId.length === 0) {
    record['metadata'] = {
      ...(typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}),
      user_id: camouflageClaudeUserId(),
    }
    changed = true
  }
  return changed ? JSON.stringify(record) : undefined
}
