/**
 * Pure draft logic of the thinking-effort editor: mapping a stored declaration
 * to the editor's checkbox draft and back, plus semantic comparison. Kept out
 * of the component so the intent rules are unit-testable without React.
 *
 * @module dsh-model-think-level/client/effort
 */
import { type ReasoningEfforts, type ThinkingLevel } from '../knowledge.js';
/** The escalation order, matching the schema's ladder (same tuple, local alias). */
export declare const LEVEL_ORDER: readonly ThinkingLevel[];
/** Draft state of one level's wire value. */
export type DraftLevels = Record<ThinkingLevel, {
    on: boolean;
    wire: string;
}>;
/** What the editor can write: unset (no declaration), disabled (false), or a dict. */
export type EffortIntent = ReasoningEfforts | false | undefined;
/**
 * The draft of one declaration. A `false` declaration (reasoning disabled)
 * shows as the off level armed — saving it writes `false`; an unset
 * declaration shows as every level off — saving it unsets the field.
 */
export declare function draftFrom(efforts: EffortIntent): DraftLevels;
/**
 * Resolve a draft to the value to write:
 *  - no level armed          → `undefined` (unset the declaration);
 *  - only `off` armed        → `false` (reasoning disabled);
 *  - at least one thinking level → the dict (with `off` when armed).
 *
 * The off level's wire value is meaningful: `null` means "send nothing"
 * (pi-ai lets the endpoint default apply), while a string is what
 * dispatch sends to close thinking — `none` on OpenAI-style endpoints,
 * or any non-null spelling to arm the deepseek/zai formats' explicit
 * `thinking: disabled`.
 */
export declare function buildIntent(draft: DraftLevels): EffortIntent;
/** Semantic equality of two intents, independent of object key order. */
export declare function sameEfforts(a: EffortIntent, b: EffortIntent): boolean;
