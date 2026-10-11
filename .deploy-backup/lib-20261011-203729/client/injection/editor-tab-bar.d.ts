/**
 * The provider editor's segmented control (供应商配置 / 模型配置 / 高级配置).
 *
 * This is the bar the editor-tabs pass drives. It lives HERE, in the plugin's
 * own React subtree, rather than being built by the pass and inserted into the
 * official card: the card's children belong to React, and a foreign node in
 * that list survives only until the next render. The component is rendered
 * inside the provider-card slot's own mount — a child of the card the slot
 * already resolves — and the stylesheet reveals it as soon as the pass marks
 * the card (`bre-tabbed`), which happens in the same mutation batch as the
 * official render.
 *
 * The component renders STRUCTURE only: it holds no state, because the card's
 * `data-bre-tab` attribute is the source of truth for both the pane switch
 * (pure CSS) and the selected button. The pass owns the copy, the per-pane
 * availability and `aria-selected`, so a language switch relabels the bar
 * without a re-render and a pane that is not on the card hides its own button.
 *
 * @module dsh-model-think-level/client/injection/editor-tab-bar
 */
import type { ReactNode } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
export interface EditorTabBarProps {
    /** The plugin's own mount inside the card this bar switches. It hangs
     * directly off the card, which is how the card is resolved on click. */
    host: {
        readonly current: HTMLDivElement | null;
    };
    /** The plugin's translator. */
    t: Translate;
}
/** One provider editor's tab bar. */
export declare function EditorTabBar({ host, t }: EditorTabBarProps): ReactNode;
