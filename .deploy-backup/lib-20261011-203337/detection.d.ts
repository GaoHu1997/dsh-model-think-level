/**
 * Endpoint reasoning/modality-signal detection over a provider's RAW /models
 * listing.
 *
 * The sanctioned `llm.discoverModels` wire call strips capability signals
 * host-side, so the host half proxies the raw listing through a same-origin
 * route; this module is the pure half both ends share. Detection approach
 * follows the format survey proven by dsh-reasoning-efforts (MIT): listings
 * disclose capabilities under several field conventions, and "no signal"
 * must stay distinct from "explicitly unsupported" -- for modalities just as
 * for reasoning.
 *
 * @module dsh-model-think-level/detection
 */
/** One raw /models listing entry: pass through unknown fields untouched. */
export type RawModelEntry = Record<string, unknown>;
/** Tri-state endpoint signal: true reasons, false explicitly does not, 'unknown' = the listing never said. */
export type EndpointReasoning = boolean | 'unknown';
/**
 * What the endpoint disclosed about one model. Every part is independent and
 * may be absent: an absent part means the listing never spoke about it (or
 * the probe never ran) -- silence is not refusal.
 */
export interface EndpointSignal {
    reasoning: EndpointReasoning;
    /** The listing field that produced the reasoning signal, null when none did. */
    source: string | null;
    /**
     * The listing's input-modality disclosure, lowercased, when it named a
     * field we recognize. Members outside the harness's image/text world
     * (audio, video, pdf/file) are passed through verbatim -- the knowledge
     * layer owns the intersection with the core vocabulary.
     */
    input?: readonly string[];
    /** Context length the listing disclosed, when it carries one. */
    contextLength?: number;
}
/** Find the raw listing entry for one model id. */
export declare function findListingEntry(listing: unknown, modelId: string): RawModelEntry | undefined;
/**
 * Read one listing entry's REASONING signal. Field conventions covered:
 *   - `supported_features: [..., "reasoning"]`        (rich feature arrays)
 *   - `supported_parameters: [..., "reasoning" | "include_reasoning" |
 *      "reasoning_effort"]`                           (OpenRouter-style)
 *   - `supports_reasoning` / `supportsReasoning`      (boolean flags)
 *   - `can_reason` / `reasoning`                      (boolean flags)
 *   - top-level `reasoning_effort` / `supports_reasoning_effort`
 *
 * A bare `{id, object, owned_by}` listing yields 'unknown' -- that is NOT
 * "unsupported": the endpoint simply never said.
 */
export declare function analyzeListingEntry(entry: unknown): EndpointSignal;
/**
 * Detect one model's endpoint signal from a raw listing.
 * @returns the signal, plus whether the model appeared in the listing at all.
 */
export declare function detectModelSignal(listing: unknown, modelId: string): {
    found: boolean;
    signal: EndpointSignal;
};
