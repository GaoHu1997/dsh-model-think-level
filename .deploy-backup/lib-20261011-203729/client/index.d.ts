/**
 * Browser half of dsh-model-think-level.
 *
 * This is the ASSEMBLY LAYER: it registers the copy dictionaries and the
 * stylesheet, builds the injection modules with their dependencies, and wires
 * them to the plugin fiber's lifecycle. The behaviour itself lives in
 * `src/client/injection/`, one module per seam:
 *
 *   models-page.ts          the Models-page DOM injection (observer + editors)
 *   models-page-editor.ts   the editor injector behind it (anchors, staging, flush)
 *   composer-menu.ts        the composer slider AND the model search box
 *   session-directory.ts    the per-session directory + effort-memory wiretaps
 *   configured-efforts.ts   the settings document's per-model `defaultEffort` cache
 *   slider-toggle-slot.ts   the Models-page footer toggle
 *   provider-order-drag.ts  the Models-page provider-row drag handles (order)
 *   provider-order.ts       the stored provider order (settings page + composer)
 *   provider-toggle.ts      the Models-page per-provider enable switch
 *   provider-enabled.ts     the stored disabled providers (settings page + composer)
 *   autofill-run.ts         the running auto-fill complement (issue #7)
 *   mount.tsx               foreign React roots and the render boundary
 *   model-menu.ts           locating the official composer model menu
 *
 * Contributions, all of which dispose with the plugin fiber:
 *   1. The DOM bypass injector: a MutationObserver over the whole document
 *      keeps the official Models page's model rows equipped with the
 *      thinking-effort editor, wherever the page lives in the settings
 *      surface (a panel, a dialog, a portal). This is the SINGLE path:
 *      the official per-model disclosure keeps the same anchors (the
 *      `modelAdvanced` dictionary value — Capacities / 容量 through
 *      0.1.6-alpha.1, Model options / 模型选项 from 0.1.6-alpha.2), so the
 *      editor lives under each model row rather than on the provider card.
 *   2. The composer reasoning-effort slider AND the model search box, mounted
 *      inside the OFFICIAL model menu opened from the bottom-right seat. The
 *      seat's trigger is never touched — the official "model · effort" display
 *      stays. The search box is unconditional: it does not follow the slider
 *      preference.
 *   3. The Models-page slider toggle, taking the official
 *      'settings.models.footer' slot unconditionally at apply.
 *   4. The stylesheet and copy dictionaries.
 *
 * @module dsh-model-think-level/client
 */
import type { ClientContext } from './types.js';
import { STORE_NS } from '../constants.js';
import { type BreKey } from './locales.ts';
/** Stable plugin id, matching the cordis.patch.yml row and the bundle id. */
export declare const name = "dsh-model-think-level";
/** Cordis fiber dependencies of the browser half. */
export declare const inject: string[];
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** This plugin's copy dictionaries. */
        [STORE_NS]: BreKey;
    }
}
/**
 * Apply the browser half.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
export type { BreKey };
export { EffortEditor } from './EffortEditor.tsx';
export type { EffortEditorProps, EffortModel } from './EffortEditor.tsx';
export { findModelMenu, findModelTrigger } from './injection/model-menu.js';
export type { InjectorDeps, EditorMountProps, ScanState } from './injection/models-page-editor.js';
export * from './ops.ts';
export * from './types.ts';
