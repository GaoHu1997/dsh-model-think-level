/**
 * Provider request-header overlay, PURE half: the origin index and the header
 * value rules shared by the fetch-layer installer and the conflict report.
 *
 * Why this exists at all (issue #12): a route's `headers` dict can be merged or
 * overwritten by the official adapter's attribution headers, with `user-agent`
 * being the most visible case. A gateway that depends on any configured client
 * header therefore may not see the value stored in the profile. The overlay
 * reapplies the complete configured dictionary at the fetch layer, the last
 * public seam before the request reaches the wire.
 *
 * The index keeps every route's endpoint path and configured model ids. The URL
 * alone cannot distinguish two routes that share an origin, while an OpenAI-
 * compatible chat request carries the selected model in its JSON body. The
 * origin map remains as a backwards-compatible fallback for requests that do
 * not expose enough identity (for example a GET /models probe).
 *
 * @module dsh-model-think-level/headers-core
 */
/** One route's configured request headers and its fetch matching metadata. */
export interface HeaderOverride {
    /** `scheme://host:port` of the route's endpoint, exactly as Fetch would print it. */
    origin: string;
    /** Normalized pathname prefix from the route's baseURL. */
    pathPrefix: string;
    /**
     * The string header pairs to apply at the fetch layer. Empty when the route
     * declares none: the route still participates in matching, so a request that
     * clearly belongs to it is NOT given another route's headers.
     */
    headers: Record<string, string>;
    /** The route key that declared them (diagnostics and UI labelling). */
    route: string;
    /** Model IDs declared by this route, used to disambiguate shared endpoints. */
    modelIds: string[];
    /** The configured `user-agent`, retained for compatibility and diagnostics. */
    userAgent?: string;
    /** Whether this route actually declares sendable request headers. */
    hasHeaders: boolean;
}
/** Backwards-compatible name retained for callers that only knew the UA seam. */
export type UserAgentOverride = HeaderOverride;
/** A same-origin header disagreement that the URL-only fetch seam cannot disambiguate. */
export interface HeaderConflict {
    origin: string;
    header: string;
    routes: string[];
    values: string[];
}
/** The route index plus what could not be indexed or was ambiguous. */
export interface HeaderIndex {
    /** Every route with a usable endpoint, headers included or not. */
    routes: HeaderOverride[];
    /** Every route with sendable headers, retained for diagnostics and the UI. */
    overrides: HeaderOverride[];
    /** origin → first complete header override, used as a conservative fallback. */
    byOrigin: Map<string, HeaderOverride>;
    /** Same-origin routes that declare different header values. */
    conflicts: {
        origin: string;
        routes: string[];
        values: string[];
    }[];
    /** Same-origin disagreements for any configured header. */
    headerConflicts: HeaderConflict[];
}
/** Backwards-compatible name retained for the original public index contract. */
export type UserAgentIndex = HeaderIndex;
/** An empty index, for the "no route declares headers" case. */
export declare function emptyIndex(): HeaderIndex;
/** The `scheme://host:port` of a URL string, or undefined when unparseable. */
export declare function originOf(url: string | undefined): string | undefined;
/**
 * Whether a configured value can ride a Fetch `user-agent` field. Refused
 * rather than sanitized: a header carrying a newline is a request-splitting
 * hazard, and quietly rewriting the user's value would send something they
 * never asked for.
 * @param value - the configured header value.
 * @returns whether it is safe to `Headers.set()`.
 */
export declare function isSendableUserAgent(value: string): boolean;
/**
 * Whether a configured name/value pair can ride a Fetch header. Fetch is the
 * authority for the exact token grammar, so this accepts arbitrary legal names
 * instead of maintaining a brittle allow-list.
 */
export declare function isSendableHeader(name: string, value: string): boolean;
/** The `headers` dict of one route profile, as string pairs, or undefined. */
export declare function headersOf(profile: Record<string, unknown> | undefined): Record<string, string> | undefined;
/**
 * The `user-agent` a route's `headers` dict declares, case-insensitively.
 *
 * A `user-agent` stored here is the user's DECLARATION of the identity their
 * gateway wants, even though the official adapter discards it; the plugin reads
 * the same key so the settings document stays the single source of truth.
 * @param profile - one route's profile record.
 * @returns the value, or undefined when the route declares none.
 */
export declare function declaredUserAgent(profile: Record<string, unknown> | undefined): string | undefined;
/** Build the route index from each provider profile's endpoint and header declaration. */
export declare function buildHeaderIndex(providers: Record<string, Record<string, unknown>>): HeaderIndex;
/** Original public name retained while callers migrate to the generic index. */
export declare function buildUserAgentIndex(providers: Record<string, Record<string, unknown>>): UserAgentIndex;
/** The pathname of a request URL, normalized the way {@link pathPrefixOf} is. */
export declare function requestPathOf(url: string): string | undefined;
/**
 * The model id carried by a JSON request body, or undefined when the body is
 * not JSON / names no string `model`. OpenAI-compatible chat completions and
 * responses both put the selected model in the top-level `model` field.
 */
export declare function modelOfJsonBody(body: string): string | undefined;
/**
 * The routes that could own a request, narrowed by origin and endpoint path.
 *
 * The result is the set the fetch layer must disambiguate: one element means
 * the URL already identifies the route (no body read is needed), several means
 * only the request's own `model` can decide, and zero means no route matches.
 * @param index - the live route index.
 * @param url - the request URL.
 * @returns the candidate overrides, in declaration order.
 */
export declare function pathCandidatesOf(index: HeaderIndex, url: string): HeaderOverride[];
/**
 * Pick one route out of already-narrowed candidates by the request body's model.
 *
 * The model only decides when exactly one candidate declares it; a model no
 * candidate declares, or a model several candidates share, falls back to the
 * first declarer — the same conservative rule as a request with no model at
 * all.
 * @param candidates - the path-narrowed candidates, in declaration order.
 * @param model - the model id read from the request body, when one was found.
 * @returns the override to apply, or undefined when there are no candidates.
 */
export declare function selectOverrideFrom(candidates: HeaderOverride[], model?: string): HeaderOverride | undefined;
/**
 * Pick the route whose configured headers belong on one request.
 *
 * Two routes can share an origin, which the URL alone cannot separate. The
 * choice is therefore narrowed in three steps: the endpoint path prefix (see
 * {@link pathCandidatesOf}), then the `model` carried by the JSON body (see
 * {@link selectOverrideFrom}), then the first declarer. A request that cannot
 * be pinned down therefore keeps the conservative behaviour the plugin shipped
 * with, and the index's conflict report tells the user the endpoints overlap.
 * @param index - the live route index.
 * @param url - the request URL.
 * @param model - the model id read from the request body, when one was found.
 * @returns the override to apply, or undefined when no route matches.
 */
export declare function selectOverride(index: HeaderIndex, url: string, model?: string): HeaderOverride | undefined;
/**
 * The request URL a Fetch call is aimed at, or undefined when it cannot be
 * classified. A `Request` from another realm fails the `instanceof` test and is
 * reported as unclassifiable rather than mis-read — the same conservative
 * posture the official fetch seam takes.
 * @param input - the fetch input.
 * @returns the URL string, when one can be read.
 */
export declare function requestUrlOf(input: unknown): string | undefined;
