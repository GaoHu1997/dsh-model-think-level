/**
 * The advanced-configuration pane of one provider card, assembled.
 *
 * The pane is one form over two sections — the request headers, then how the
 * route presents itself — and ends in ONE commit row under both. Splitting the
 * sections into two components with two commit rows would have made the pane
 * read as two forms and put a 保存 between them, which is exactly the shape
 * that was wrong: a Save above the disguise looked like a Save for the headers
 * alone, and the section below it looked left out of the form.
 *
 * So this component owns what the sections share: the disguise draft lives
 * here, the header editor renders it as {@link CamouflageEditor} through its
 * `extras` seat, and the editor's own Save commits both ({@link
 * useCamouflage}'s `commit` runs after the header write, before the card
 * closes). The disguise therefore only reaches the host on Save; picking a
 * preset and pressing 取消 leaves nothing behind.
 *
 * @module dsh-model-think-level/client/AdvancedPane
 */

import type { ReactNode } from 'react'
import { CamouflageEditor, useCamouflage } from './CamouflageEditor.js'
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
  return (
    <HeadersEditor
      route={route}
      api={api}
      t={t}
      onDismiss={onDismiss}
      extras={(
        <CamouflageEditor
          t={t}
          value={camouflage.value}
          installed={camouflage.installed}
          disabled={camouflage.loading}
          onChange={camouflage.setValue}
        />
      )}
      onCommitExtras={camouflage.commit}
      onResetExtras={camouflage.reset}
    />
  )
}
