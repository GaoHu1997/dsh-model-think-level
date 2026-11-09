/**
 * The advanced-configuration pane of one provider card, assembled.
 *
 * The pane is one form over three sections — the request headers, how the route
 * presents itself, and whether it recovers old Responses topics — and ends in
 * ONE commit row under all three. Splitting the sections into separate
 * components with separate commit rows would have made the pane read as several
 * forms and put a 保存 between them, which is exactly the shape that was wrong:
 * a Save above a section looked like a Save for the headers alone, and the
 * sections below it looked left out of the form.
 *
 * So this component owns what the sections share: the disguise and
 * history-compatibility drafts live here, the header editor renders them as
 * {@link CamouflageEditor} and {@link HistoryCompatEditor} through its `extras`
 * seat, and the editor's own Save commits all of them. A switch clicked and
 * then abandoned with 取消 therefore leaves nothing behind.
 *
 * @module dsh-model-think-level/client/AdvancedPane
 */

import type { ReactNode } from 'react'
import { CamouflageEditor, useCamouflage } from './CamouflageEditor.js'
import { HistoryCompatEditor, useHistoryCompat } from './HistoryCompatEditor.js'
import { HeadersEditor } from './HeadersEditor.js'
import type { RemoteApi } from './types.js'

/** Props of {@link AdvancedPane}. */
export interface AdvancedPaneProps {
  /** The provider route this card edits. */
  route: string
  /** The write seam for the header section. */
  api: RemoteApi
  /** Localized copy. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** Close the whole card, as the official footer's 取消 does. */
  onDismiss?: () => void
}

/**
 * Render the pane: headers, then the disguise, then the single commit row.
 * @param props - route identity, write seam, copy and the card dismiss seam.
 * @returns the pane.
 */
export function AdvancedPane({ route, api, t, onDismiss }: AdvancedPaneProps): ReactNode {
  const camouflage = useCamouflage(route, t)
  const historyCompat = useHistoryCompat(route)
  return (
    <HeadersEditor
      route={route}
      api={api}
      t={t}
      onDismiss={onDismiss}
      extras={(
        <>
          <CamouflageEditor
            t={t}
            value={camouflage.value}
            installed={camouflage.installed}
            disabled={camouflage.loading}
            onChange={camouflage.setValue}
          />
          <HistoryCompatEditor
            t={t}
            value={historyCompat.value}
            installed={historyCompat.installed}
            disabled={historyCompat.loading}
            onChange={historyCompat.setValue}
          />
        </>
      )}
      onCommitExtras={async () => {
        // Both sections commit under this one Save. A rejected write must not
        // skip the other one, but the pane still has to stay open, so the first
        // failure is re-thrown once both writes have settled.
        const results = await Promise.allSettled([camouflage.commit(), historyCompat.commit()])
        const failed = results.find(result => result.status === 'rejected')
        if (failed !== undefined) throw (failed as PromiseRejectedResult).reason
      }}
      onResetExtras={() => {
        camouflage.reset()
        historyCompat.reset()
      }}
    />
  )
}
