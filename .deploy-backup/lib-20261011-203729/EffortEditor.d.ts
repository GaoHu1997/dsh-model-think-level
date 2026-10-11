/**
 * The thinking-effort + input-modality editor injected into the official
 * Models page's model rows. Rendered with ReactDOM.createRoot into a DOM
 * container the injector creates, it needs no harness services of its own:
 * everything arrives through a plain props face, so it stays testable in
 * isolation. The draft/intent rules live in the client/effort module.
 *
 * Suggestion feedback is ZONED: provenance + confidence form their own line;
 * capacity references render as a separate read-only block explicitly marked
 * "never auto-filled" -- the official capacity inputs above stay untouched.
 * The apply/reset actions sit at the very bottom and own every section.
 *
 * @module dsh-model-think-level/EffortEditor
 */
import type { ReactNode } from 'react';
import type { CompatSuggestion, InputModalities, ReasoningEfforts } from '../knowledge.js';
import { type DraftLevels, type EffortIntent } from './effort.js';
import type { EffortEditorApi, EffortWriteIntent, PendingWrite, PendingWriteParts } from './types.js';
/** One model row's data the editor needs. */
export interface EffortModel {
    /** Model id (the settings key). */
    id: string;
    /** Display name, when one is set. */
    name?: string;
    /** The model's current reasoningEfforts declaration. */
    efforts?: false | ReasoningEfforts;
}
/** Props of {@link EffortEditor}. */
export interface EffortEditorProps {
    /** Route key. */
    route: string;
    /**
     * Route display name. Part of the mount contract but never rendered here:
     * this editor lives inside ONE model row, whose provider card already
     * carries the name, so the component does not even destructure it. The
     * injector keeps it in the prop set and its sameProps diff compares it, which
     * is what catches a provider rename under an already-mounted editor.
     */
    routeDisplayName: string;
    /** Route wire protocol, when configured. */
    routeApi?: string;
    /** Route endpoint, when configured. */
    routeBaseURL?: string;
    /** Model id. */
    modelId: string;
    /** Model display name, when one is set. */
    modelName?: string;
    /** The model's current reasoningEfforts declaration. */
    efforts?: false | ReasoningEfforts;
    /** A deliberate unset is also a configured decision bulk adapt must preserve. */
    effortsUnset?: boolean;
    /** The model's current input-modality declaration. */
    input?: InputModalities;
    /** The model's stored compat block (passthrough; suggestions merge over it). */
    compat?: CompatSuggestion;
    /** The model's stored per-model default-effort pick, when one is set. */
    defaultEffort?: string;
    /** Model row index (for aria labels). */
    index: number;
    /**
     * The model row is not saved yet (a create card's draft route, or a new
     * model row on a saved route). Apply then stages the declaration instead
     * of writing settings; the injector applies staged declarations
     * automatically once the row is saved.
     */
    staged?: boolean;
    /**
     * Whether the official Models page owns input types for this row (the
     * 0.1.6-alpha.2 `ModelInputTypes` control was sniffed in the disclosure).
     * True hides the modality section: the official editor is the single
     * surface, so showing a second one would be duplicate UI. Older kernels
     * have no such control and keep the section.
     */
    officialInputTypes?: boolean;
    /** The write seam (settings.mutate plus the suggestion engine). */
    api: EffortEditorApi;
    /** Read-only (settings document not writable). */
    readOnly: boolean;
    /** Localized copy. */
    t: (key: string, params?: Record<string, string | number>) => string;
}
/** Draft state of the modality part: declared or inheriting, image or not. */
export interface DraftModality {
    declared: boolean;
    image: boolean;
}
/** Read the stored declaration into a draft. Empty mirrors undefined: the
 * resolved settings layer materializes absent arrays as [], and core reads
 * that as "no answer here" -- never as a phantom text-only declaration. */
export declare function modalityFrom(input: InputModalities | undefined): DraftModality;
/** Resolve a modality draft to the write intent (null = durably unset). */
export declare function buildModalityIntent(draft: DraftModality): InputModalities | null;
/**
 * The compat fields this editor can SET, per protocol — which is also the set
 * it may clear. A key from neither list survives an apply untouched: a
 * hand-tuned field the UI never showed is not this editor's to drop. Clearing
 * a picker means unset, not "keep whatever was chosen last".
 */
export declare const OWNED_COMPAT_KEYS: Readonly<Record<string, readonly string[]>>;
/** The compat fields clearable on one protocol (empty = this edit owns none). */
export declare function ownedCompatKeys(routeApi: string | undefined): readonly string[];
/** The owned compat fields the draft actually left EMPTY. */
export declare function clearedCompatKeys(routeApi: string | undefined, draft: CompatSuggestion | undefined): readonly string[];
/**
 * The `clearCompatKeys` part of a commit, derived from the draft.
 *
 * A DEFINED draft always reports (an empty array is meaningful: every owned
 * field it shows is set). An EMPTY draft must still clear the fields the
 * protocol OWNS -- dropping the last owned pick is a user decision to unset --
 * but only when there is something to clear: an unrelated route keeps the
 * shape it always had (no `clearCompatKeys` at all).
 * @param routeApi - the route's wire protocol.
 * @param writeCompat - the compat bytes this commit writes, if any.
 * @returns the clear part to spread into the commit payload.
 */
export declare function compatClearIntent(routeApi: string | undefined, writeCompat: CompatSuggestion | undefined): {
    clearCompatKeys?: readonly string[];
};
/** Semantic equality between a modality draft and a stored declaration. */
export declare function sameModality(draft: DraftModality, stored: InputModalities | undefined): boolean;
/**
 * The ladder part of a write, from a switch state and the draft it resolves to.
 *
 * `'keep'` when nothing is armed and nothing is stored: that is a no-op, NOT an
 * unset — an undefined there would stamp the durable unset marker onto a
 * never-declared model and silence host auto-fill.
 * @param nextThinking - the (pre-update) switch state the edit resolved to.
 * @param built - `buildIntent` of the draft the edit resolved to, which is the
 *   explicit `false` when the only armed level is 'off'.
 * @param initialEfforts - the row's stored declaration.
 * @returns the ladder intent to write.
 */
export declare function ladderIntent(nextThinking: boolean, built: EffortIntent, initialEfforts: EffortWriteIntent | undefined): EffortWriteIntent;
/**
 * The compat draft a FRESH editor on this row would hold.
 *
 * The editor's three compat inputs are seeded from the stored block, so an
 * untouched editor's draft is exactly the stored block restricted to the three
 * fields it shows. The injector's provider-wide adapt has no editor to ask for
 * a draft, so it derives the same value here: a hand-tuned field the UI does
 * not show stays untouchable, and one it does show survives the write.
 * @param compat - the row's stored compat block.
 * @returns the draft, or undefined when it holds no field at all.
 */
export declare function compatDraftOf(compat: CompatSuggestion | undefined): CompatSuggestion | undefined;
/**
 * Assemble one complete pending write from the parts a caller resolved: the
 * compat merge (the applied suggestion's block with the caller's own fields on
 * top), the thinking-budget default an openai-completions endpoint needs, and
 * the clear list for the fields this write OWNS and left empty.
 *
 * The single implementation of that assembly: the row's own editor reports the
 * user's edits through it, and the injector's provider-wide adapt reports
 * collapsed rows through it, so the same suggestion always writes the same
 * bytes whichever path applied it.
 * @param parts - the resolved parts (see {@link PendingWriteParts}).
 * @returns the write to hand the injector's ledger.
 */
export declare function pendingWriteOf(parts: PendingWriteParts): PendingWrite;
/**
 * Render one model's thinking-effort + input-modality editor: the level
 * checkboxes, the modality toggle, the auto-adapt action, and the
 * apply/reset actions that own both sections.
 */
export declare function EffortEditor({ route, routeApi, routeBaseURL, modelId, modelName, efforts: initialEfforts, effortsUnset, input: initialInput, compat: initialCompat, defaultEffort: initialDefaultEffort, index, staged, officialInputTypes, api, readOnly, t }: EffortEditorProps): ReactNode;
export type { DraftLevels };
