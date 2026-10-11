/**
 * Real-time search filter for the composer model selection panel.
 *
 * Injected above the official provider-group list while the drilled-in model
 * pane is open (`section[role="group"]` present). Filters the official option
 * buttons and provider groups via zero-dependency DOM visibility toggles
 * without mutating the underlying ModelDirectory store, and never touches the
 * official card's own sizing or scrolling.
 *
 * @module dsh-model-think-level/client/ModelSearch
 */
import type { ReactNode } from 'react';
/** Props of {@link ModelSearch}. */
export interface ModelSearchProps {
    /** The official menu element containing group sections and model options. */
    menu: HTMLElement;
    /** Localized copy translator. */
    t: (key: string, params?: Record<string, string | number>) => string;
}
/**
 * Whether the menu currently shows the drilled-in model list.
 *
 * Deliberately structural: the official effort pane renders
 * `button[role="menuitemradio"]` too (ModelSelect.tsx:464) and would match a
 * role-based probe, while only the model pane renders provider groups. The
 * probe also avoids class names — the groups container's `groups` class is a
 * CSS-module hash (`Uc5hea_groups` in the official build), so a literal
 * `.groups` selector never matches.
 */
export declare function isModelPane(menu: HTMLElement): boolean;
/** The visible, enabled option buttons, in document order. */
export declare function visibleOptions(menu: HTMLElement): HTMLButtonElement[];
/**
 * Filter official model option buttons and provider groups by search query.
 *
 * `touched` records the inline `display` each node held BEFORE this filter
 * first changed it, so the restore pass puts back the node's own value instead
 * of blindly clearing an inline style the official menu may have set itself.
 * @param menu - the official menu element.
 * @param query - the raw search text; empty restores everything.
 * @param touched - carry-over map of the nodes this filter currently hides.
 * @returns number of visible model buttons across all groups.
 */
export declare function filterMenuModels(menu: HTMLElement, query: string, touched?: Map<HTMLElement, string>): number;
/**
 * Search input and empty-state controller for the model menu.
 */
export declare function ModelSearch({ menu, t }: ModelSearchProps): ReactNode;
