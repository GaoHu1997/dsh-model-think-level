/**
 * The composer model menu injection: the reasoning-effort slider AND the model
 * search box, both mounted inside the OFFICIAL model menu opened from the
 * bottom-right seat. The official menu body remains host-owned apart from the
 * replicated rows; its trigger keeps its own children and receives only a
 * provider prefix through a plugin-owned data attribute.
 *
 * This module is the single place that decides which pane the menu is showing,
 * where each foreign body sits, and when each one retires. The two pane probes
 * look alike but answer different questions, and must NOT be merged:
 *
 *   - the slider's probe — `[role="menuitemradio"]` — asks "did the official
 *     drill-in replace my replica body?". The effort pane matches too, which
 *     is fine: our body belongs to the root pane either way.
 *   - the search's probe — `section[role="group"]` — asks "is there a
 *     filterable model list here?". The effort pane has no groups, so a
 *     role-based probe would mount a search box over a list it cannot filter.
 *
 * @module dsh-model-think-level/client/injection/composer-menu
 */
import type { ReactNode } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ModelDirectoryLike } from '../types.js';
/** Everything the composer injection needs from its host. */
export interface ComposerMenuDeps {
    /** The official menu element, or undefined while it is closed. */
    menuOf: () => HTMLElement | undefined;
    /** The official model trigger, present even while the menu is closed. */
    triggerOf: () => HTMLElement | undefined;
    /** The plugin's locale-bound translator. */
    t: Translate;
    /** Wrap a subtree so it re-translates on a language switch. */
    refreshed: (children: () => ReactNode) => ReactNode;
    /** Whether the composer slider preference is on. */
    sliderEnabled: () => boolean;
    /** The current session's model directory, or undefined in the boot window. */
    directory: () => ModelDirectoryLike | undefined;
}
/** The composer injection's face: one reconcile per scan, one dispose per fiber. */
export interface ComposerMenuInjection {
    /** Mount/reposition/retire both foreign roots (idempotent, mutation-cheap). */
    reconcile: () => void;
    /** Unmount both roots; the fiber is going away. */
    dispose: () => void;
}
/**
 * Build the composer menu injection.
 * @param deps - menu lookup, copy, locale refresh, preference and directory.
 * @returns the injection's {@link ComposerMenuInjection} face.
 */
export declare function createComposerMenu(deps: ComposerMenuDeps): ComposerMenuInjection;
