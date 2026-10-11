/**
 * Coexistence report for the user-agent takeover (issue #12, MVP-3).
 *
 * Overriding `user-agent` is not a private act: the stock adapter drops the
 * profile's value, so at least one published plugin patches the adapter itself
 * to keep it, and several more wrap fetch. Two of them active at once means the
 * LAST writer on the wire wins and the user sees a `user-agent` they did not
 * choose — with no error anywhere. This module reports what it found instead of
 * silently fighting.
 *
 * Three signals, in descending reliability:
 *   1. The adapter file already carries a user-agent patch (its `requestHeaders`
 *      body no longer drops the profile's `user-agent`) — readable fact.
 *   2. A known sibling plugin's package is installed in a reachable tree.
 *   3. Nothing found.
 *
 * Everything here is best-effort and side-effect-free: an unreadable path, an
 * absent tree, or a hostile `package.json` yields `unknown`, never a throw —
 * this report must not be able to disable the plugin.
 *
 * @module dsh-model-think-level/headers-conflict
 */
/** What the report found about the adapter the requests actually flow through. */
export type AdapterPatchState = 'patched' | 'stock' | 'unknown';
/** One sibling plugin package found on disk. */
export interface InstalledSibling {
    /** Package name. */
    name: string;
    /** Absolute path of the resolved package directory (or entry file). */
    path: string;
}
/** The coexistence report. */
export interface HeaderConflictReport {
    /** Whether the installed `@deepseek-ai/dsh-llm-pi-ai` adapter carries a UA patch. */
    adapter: AdapterPatchState;
    /** Path of the inspected adapter file, when one was found. */
    adapterPath?: string;
    /** Known sibling plugins present on disk. */
    siblings: InstalledSibling[];
    /**
     * Whether this deployment should prefer the official layer instead of this
     * plugin's fetch takeover: true exactly when the adapter is already patched
     * (a profile `user-agent` reaches the wire on its own then, and a fetch
     * override on top would fight the patch).
     */
    preferOfficialLayer: boolean;
}
/**
 * Whether a source text of the pi-ai adapter bundle carries a user-agent patch.
 *
 * Pure, so the decision is testable without touching a real installation: the
 * stock `requestHeaders()` filters the profile's `user-agent` into the reserved
 * set and contains neither marker, while every published revision of the patch
 * names the value it found.
 * @param source - the adapter bundle's text.
 * @returns whether the patch is present.
 */
export declare function adapterSourcePatched(source: string): boolean;
/**
 * Produce the coexistence report. Never throws: every probe degrades to
 * `unknown` / an empty list.
 * @returns the report.
 */
export declare function detectHeaderConflicts(): HeaderConflictReport;
