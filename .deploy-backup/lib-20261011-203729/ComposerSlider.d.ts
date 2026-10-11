import type { ReactNode } from 'react';
import type { DirectoryCurrentLike, DirectoryGroupLike, EffortLevelLike, ModelDirectoryLike, ModelDirectoryStateLike } from './types.js';
/** The model's declared effort levels, when there are at least two to choose from. */
export declare function sliderLevels(state: ModelDirectoryStateLike): readonly EffortLevelLike[];
/** The current model of a directory snapshot. */
export declare function currentModelOf(state: ModelDirectoryStateLike): DirectoryCurrentLike | null;
/**
 * Level index the body should report as current: the session's current effort
 * when the model still offers it, else the adapter default, else the middle.
 */
export declare function effectiveEffortIndex(levels: readonly EffortLevelLike[], state: ModelDirectoryStateLike): number;
/** The plugin's bound translator (the props face, named for reuse below). */
type Translator = (key: string, params?: Record<string, string | number>) => string;
/** Props of {@link ComposerSlider}. */
export interface ComposerSliderProps {
    /** The session's shared model directory (load + select ride the official seam). */
    directory: ModelDirectoryLike;
    /** Localized copy (the plugin's bound translator). */
    t: Translator;
    /**
     * Re-measure hook. The official card measures itself from its own layout
     * effect (`[open, pane, state]`) and only re-runs on a window `resize`, so a
     * body that grows here must ask the injector to re-place it — in the same
     * frame, never from a deferred task.
     */
    onLayoutChange?: () => void;
}
/** Provider label: the SDK face names it differently across kernel lines. */
export declare function providerLabelOf(group: DirectoryGroupLike): string;
/**
 * Render the model row and the reasoning-level row. Both values come from the
 * store; the commit travels through {@link ModelDirectoryLike.select}
 * (optimistic, rolled back on refusal).
 */
export declare function ComposerSlider(props: ComposerSliderProps): ReactNode;
export {};
