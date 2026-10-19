/**
 * The 高级配置 pane's second section: the route settings that are not request
 * headers. Its row is the long-cache switch.
 *
 * The section exists because the field a relay rejects (`prompt_cache_key`, and
 * `prompt_cache_retention` beside it) is built into the REQUEST BODY by the
 * adapter, so no header can add or remove it; the switch that does is the route
 * profile's `compat.supportsLongCacheRetention`, which the adapter's own request
 * builder reads. That is why this section exists at all, and why it wears its own
 * heading at the 请求头 heading's level instead of sitting inside the header
 * editor: a reader must not have to guess whether it is another header.
 *
 * The switch reads the setting it is labelled with — on keeps long-lived caches
 * — and its write is immediate, one boolean, the shape of a switch everywhere
 * else on this page. There is no Save of its own; the header editor's Save stays
 * the header draft's and never restates this key.
 *
 * @module dsh-model-think-level/LongCacheSection
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { describeNamespace, providerLongCacheOf, writeProviderLongCache, type ProviderLongCache } from './ops.js'
import type { RemoteApi } from './types.js'

/** Props of {@link LongCacheSection}. */
export interface LongCacheSectionProps {
  /** The provider route this card edits. */
  route: string
  /** The write seam. */
  api: RemoteApi
  /** Localized copy. */
  t: (key: string, params?: Record<string, string | number>) => string
}

/**
 * Render the pane's long-cache section.
 * @param props - route identity, write seam and copy.
 * @returns the titled section.
 */
export function LongCacheSection({ route, api, t }: LongCacheSectionProps): ReactNode {
  const [state, setState] = useState<ProviderLongCache | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | undefined>(undefined)

  // Seeded once per route, like the header draft: the state this section edits
  // lives in the settings document, not in the props the card re-renders with.
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const join = await describeNamespace(api)
        if (!live) return
        setState(providerLongCacheOf(join.namespace, route))
        setReadOnly(join.writable !== true)
      } catch {
        // A read failure leaves the section inert rather than blocking the card.
        if (live) setReadOnly(true)
      }
    })()
    return () => { live = false }
  }, [api, route])

  const disabled = readOnly || busy || state === undefined
  // The switch shows the setting its label names: ON keeps long-lived caches.
  // `undefined` (the route inherits the adapter's own detection) and `true` (the
  // route states the value) therefore share the ON position — a two-position
  // control cannot show two "not off" states, and the note under the row says
  // which of the two this route is in.
  const retained = state !== undefined && state.value !== false

  const toggle = async (): Promise<void> => {
    if (state === undefined) return
    // OFF is the explicit state, and the only one: it always writes `false`.
    //
    // Turning it back ON is not always an `unset`. A LOWER settings layer may
    // hold the same key as `false` (the shipped profile patch does on some
    // routes), and deleting the user layer's copy would expose that pin instead
    // of clearing it. When the lower layer says `false`, ON has to state `true`
    // rather than pretend the key is unowned.
    const next: boolean | undefined = retained
      ? false
      : (state.inherited === false ? true : undefined)
    setBusy(true)
    setMessage(undefined)
    let reply
    try {
      reply = await writeProviderLongCache(api, route, next)
    } catch (error) {
      reply = { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
    setBusy(false)
    if (!reply.ok) {
      setMessage({
        kind: 'error',
        text: reply.error === 'no-route' ? t('headersNoRoute')
          : reply.error === 'read-only' ? t('cacheReadOnly')
            : t('cacheError', { error: reply.error }),
      })
      return
    }
    setState({ api: state.api, offered: state.offered, value: next, inherited: state.inherited })
    setMessage({ kind: 'success', text: next === undefined ? t('cacheInherited') : t('cacheSaved') })
  }

  return (
    <div className="bre-cache">
      {/* The section's OWN heading, at the same level as the 请求头 heading above
          it: that is what tells a reader this is a different kind of setting and
          not one more request header. */}
      <div className="bre-headers-title-row">
        <span className="bre-effort-title">{t('cacheTitle')}</span>
      </div>
      {state === undefined
        ? null
        : state.offered
          ? (
            <>
              <div className="bre-cache-row">
                <span className="bre-cache-label">{t('cacheRowLabel')}</span>
                <button
                  type="button"
                  role="switch"
                  aria-label={t('cacheRowLabel')}
                  aria-checked={retained}
                  className={'bre-slider-setting-switch' + (retained ? ' is-on' : '')}
                  disabled={disabled}
                  onClick={() => { void toggle() }}
                >
                  <span className="bre-slider-setting-switch-knob" aria-hidden="true" />
                </button>
              </div>
              {/* The description sits UNDER its row: the row is the setting, the
                  line below it is why anyone would move it. */}
              <p className="bre-effort-note">{t('cacheHint')}</p>
              {state.value === true
                ? <p className="bre-effort-note">{t('cachePinned')}</p>
                : null}
              {/* A disabled switch with no reason reads as a bug: say why it
                  cannot be moved, in the same place the header editor says it. */}
              {readOnly ? <p className="bre-effort-note bre-warn">{t('cacheReadOnly')}</p> : null}
            </>
          )
          : <p className="bre-effort-note bre-warn">{t('cacheUnavailable', { api: state.api ?? '' })}</p>}
      {message === undefined
        ? null
        : (
          <p className={'bre-effort-message bre-' + message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
    </div>
  )
}
