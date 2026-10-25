/**
 * The provider-card slot registration: the seat the request-header editor
 * (issue #12) renders in.
 *
 * `settings.models.provider-card` is a KEYED slot declared by the official
 * Models section, dispatched on each card's owning settings namespace
 * (`ProviderDirectoryEntry.settingsNs`). Registering under `llm-pi-ai` is
 * therefore all it takes to receive every card of this adapter family — the
 * shipped routes, the ones the user adds, and the hand-declared ones alike —
 * without a DOM anchor, a mutation observer, or a label to match on.
 *
 * The ROUTE is not a registration-time fact: the section passes each occurrence
 * its directory row as owner props, so the route arrives on the component at
 * render time and one registration serves every card.
 *
 * The mount also hosts the editor's tab bar ({@link EditorTabBar}) and is the
 * element the editor-tabs pass resolves its card from, so the plugin's own
 * subtree is what carries both the takeover's control and the state the
 * stylesheet reveals the section on.
 *
 * @module dsh-model-think-level/client/injection/provider-card-slot
 */

import { createElement, useCallback, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { PI_AI_NS, PLUGIN_ID } from '../../constants.js'
import { HeadersEditor } from '../HeadersEditor.js'
import { EditorTabBar } from './editor-tab-bar.js'
import { editorCardOf } from './editor-tabs.js'
import type { ClientContext, RemoteApi, SlotRegistrarFace } from '../types.js'

/** The keyed-slot key this plugin occupies: the adapter family it extends. */
const SLOT = 'settings.models.provider-card'

/**
 * The occurrence props the official Models section hands one provider-card
 * extension (its own `ProviderCardExtrasOwnerProps`). Declared structurally for
 * the same reason as {@link SlotRegistrarFace}: the plugin pins only what it
 * reads, so a field the section adds cannot break activation.
 */
interface ProviderCardOccurrence {
  /** The card's directory row; `provider` is the settings route key. */
  provider?: { provider?: string }
}

/** Props the occurrence component receives: the section's share plus ours. */
export type ProviderCardSlotProps = ProviderCardOccurrence & { api: RemoteApi; t: Translate }

/**
 * Press the official editor's own dismiss button for this card.
 *
 * The two sibling panes (供应商配置 / 模型配置) end an edit with the official
 * footer's `取消`, whose handler calls `onClose(false)` and closes the whole
 * editor. The takeover keeps that footer mounted but hides it on the 高级配置
 * pane (`[data-bre-editor-body]`), so the only way this pane's 取消 can mean the
 * same thing is to press that very button: its React handler is the one piece
 * of card state no plugin can reach directly.
 *
 * The resolver mirrors the tiers `models-page-editor`'s `actionsOf` walks over
 * the same row (kept local on purpose: that one also carries the HostLabels copy
 * matching, and it backs the write fence): the row is the `editorActions`
 * container, the dismiss button is the `secondaryButton` inside it, and — were
 * a future build to drop the CSS-module class — the second-to-last button,
 * because the official footer puts the commit LAST. Unresolved or disabled means
 * no press: the caller has already reset its draft.
 * @param card - the card row the editor is mounted in, or null.
 */
function dismissCard(card: HTMLElement | null): void {
  if (card === null) return
  const row = card.querySelector('[class*="editorActions"]')
  if (row === null) return
  const buttons = Array.from(row.querySelectorAll('button'))
  const dismiss: HTMLElement | null = row.querySelector<HTMLElement>('button[class*="secondaryButton"]') ?? buttons.at(-2) ?? null
  if (dismiss === null) return
  if (dismiss instanceof HTMLButtonElement && dismiss.disabled) return
  dismiss.click()
}

/**
 * The occurrence component: resolve this card's route, render the editor with
 * its tab bar, and publish the card's open/closed state so the section reveals
 * itself with the official editor. Exported for its own tests (the registration
 * below is the production path).
 */
export function ProviderCardSlot({ provider, api, t }: ProviderCardSlotProps): ReactNode {
  const host = useRef<HTMLDivElement | null>(null)
  const route = provider?.provider
  // The card is read at press time, not captured: the row a slot mounts in is
  // the section's to re-render, and the editor itself holds no DOM knowledge.
  const dismiss = useCallback((): void => { dismissCard(editorCardOf(host.current)) }, [])

  // An occurrence can acquire its route after its first render, or lose it
  // and mount a new wrapper later. Rebind whenever that route changes.
  // User item 5: `useLayoutEffect`, not `useEffect`. The first `sync()` below is
  // what publishes `data-edit`, and `data-edit` is what reveals the tabbed
  // section; from a passive effect that write lands after the frame the card was
  // painted in, so the opened card showed the official one-column editor and
  // then re-flowed into the tabbed one — the flash reported when the provider
  // card is opened. A layout effect runs in the same commit, before paint.
  useLayoutEffect(() => {
    const wrapper = host.current
    // No card row around us (a bare render) means no card state to observe:
    // leaving `data-edit` off keeps the section hidden, which is the only safe
    // default.
    const card = editorCardOf(wrapper)
    if (wrapper === null || card === null) return
    const observed = card as unknown as Node
    // The one edit-state signal the official row exposes. The section holds
    // its editor target in component state (ui-settings-models
    // ModelsSection's `editing`) and renders the editor with NO data
    // attribute and NO aria-expanded on the row's Edit button — the CSS-module
    // class of the mounted editor (word root `editor`, compiled to a
    // `_editor*` hash) is the only thing that exists iff the card is open.
    // This is a COUPLING, not a contract: if a future official build renames
    // that class root, `data-edit` degrades to a constant 0 — the section
    // stays hidden and the official page stays untouched, so the failure mode
    // is "the feature is gone", never "the page is broken". The upgrade path
    // is an official one: a data attribute on the editor or an `editing` field
    // on the slot occurrence replaces this probe one-for-one.
    const openEditor = (): boolean => card.querySelector('[class*="_editor"]') !== null
    // Publish the card's state onto our own wrapper instead of into React
    // state. The reveal has to land in the batch the official mutation arrived
    // in: a setState from here is committed by React's scheduler, i.e. after
    // the frame that already painted the opened editor, and the section — the
    // tab bar's own container — would blink in one frame late. Writing the
    // attribute directly is the same choice the composer's popover path makes.
    // The compare keeps a settled card from emitting mutations of its own, and
    // `data-edit` is deliberately not a prop below, so React never patches it
    // back.
    const sync = (): void => {
      const edit = openEditor() ? '1' : '0'
      if (wrapper.dataset['edit'] !== edit) wrapper.dataset['edit'] = edit
    }
    sync()
    const observer = new MutationObserver(sync)
    // Child list only, and subtree: the editor element itself arrives as a
    // child of the row, and its own internals are irrelevant here.
    observer.observe(observed, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [route])

  // A card with no resolvable route is not this section's business: render
  // nothing rather than an editor that could not address a settings key.
  if (typeof route !== 'string' || route.length === 0) return null
  return createElement(
    'div',
    {
      ref: host,
      className: 'bre-headers-host',
      // Names the provider row this slot sits in, for the row-order pass. The
      // slot is dispatched per card, so it is the one place every llm-pi-ai row
      // — saved, first-run or draft — hands back its route.
      'data-bre-provider': route,
    },
    // The tab bar goes FIRST and lives in this, our own, subtree — never in the
    // official card's child list, which React reconciles. The stylesheet
    // reveals it while the card carries the editor-tabs takeover, so it appears
    // with the tabbed editor and stays hidden on a card the pass left alone
    // (the DeepSeek account editor).
    createElement(EditorTabBar, { host, t }),
    createElement(HeadersEditor, { route, api, t, onDismiss: dismiss }),
  )
}

/**
 * Take the provider-card seat.
 * @param ctx - client root context (its `slots` service registers the seat).
 * @param api - the settings Remote the editor reads and writes through.
 * @param t - the plugin's locale-bound translator.
 * @returns the seat's disposer, or a no-op when the seat is unavailable.
 */
export function registerProviderCardSlot(ctx: ClientContext, api: RemoteApi, t: Translate): () => void {
  const host = ctx as unknown as { slots?: SlotRegistrarFace }
  // `inject` is the seam the official registrar binds to the calling scope;
  // wire whatever comes back so a plugin disable / HMR leaves no seat behind.
  const injected = host.slots?.inject(SLOT, () => {
    host.slots?.register({
      name: SLOT,
      // The keyed dispatch key. `llm-pi-ai` is the ONLY family this plugin
      // extends, so one registration covers every card; other adapter families
      // dispatch other keys and never reach this component.
      key: PI_AI_NS,
      inject: () => ({ api, t }),
    }, ProviderCardSlot)
  })
  return typeof injected === 'function' ? injected as () => void : () => {}
}
