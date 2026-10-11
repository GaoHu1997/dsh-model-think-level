/**
 * The reasoning-effort + input-modality knowledge base + wire-protocol
 * inference engine.
 *
 * Every model a third-party provider route serves must declare its
 * 'reasoningEfforts' (which DSH thinking levels it accepts, and the exact
 * string to send on the wire for each) before the composer's model picker
 * offers any reasoning control for it. This module answers "what should this
 * model's declaration be?" from three sources, in order:
 *
 *   1. An endpoint listing signal (when the route was probed): an explicit
 *      "does not reason", a modality disclosure, or a context length.
 *   2. A curated knowledge base keyed by model id/name patterns, carrying the
 *      exact level set, wire spellings, request modalities, and reference
 *      capacities known to work against that family of endpoints.
 *   3. Wire-protocol inference from the route's 'api' / 'baseURL', plus a
 *      conservative name heuristic for modalities, for families nothing else
 *      names.
 *
 * All outputs stay on the adapter's own vocabulary (THINKING_LEVELS,
 * INPUT_MODALITIES, the reasoningEfforts/input dict shapes) so a suggested
 * declaration can be written to llm-pi-ai settings with no translation step.
 * A suggestion is a *preset*: the user can accept it, tune it, or ignore it.
 * The plugin never silently overwrites a declaration the user already made.
 *
 * @module dsh-model-think-level/knowledge
 */
/** The canonical pi-ai escalation order accepted by llm-pi-ai. */
export declare const THINKING_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/**
 * The request-modality vocabulary llm-pi-ai accepts on a model entry -- a
 * local mirror of pi-ai's MODALITY_GATE (text/image today). The core schema
 * refuses anything else at write time, and its drift gate forces the
 * vocabulary to grow exactly when pi-ai's Model['input'] does; the vocabulary
 * spec pins this mirror against upstream so the UI follows.
 */
export declare const INPUT_MODALITIES: readonly ["text", "image"];
export type InputModality = (typeof INPUT_MODALITIES)[number];
/** One level's wire spelling; null means "send nothing for this level". */
export type WireSpelling = string | null;
/** A full reasoning-effort declaration value: level -> wire spelling. */
export type ReasoningEfforts = Partial<Record<ThinkingLevel, WireSpelling>>;
/** A full input-modality declaration value: the modalities a model accepts. */
export type InputModalities = readonly InputModality[];
/** Reasoning-budget request-field spellings pi-ai accepts (older kernels reject them). */
export declare const THINKING_TOKEN_BUDGET_FIELDS: readonly ["thinking_token_budget", "thinking_budget", "thinking_budget_tokens"];
export type ThinkingTokenBudgetField = (typeof THINKING_TOKEN_BUDGET_FIELDS)[number];
/** The compat fields this plugin may suggest (a subset of the profile schema). */
export interface CompatSuggestion {
    /** Wire format the endpoint speaks; omitted when unknown. */
    thinkingFormat?: string;
    /** Whether the endpoint accepts a reasoning-effort-style parameter. */
    supportsReasoningEffort?: boolean;
    /**
     * Whether pi-ai may rewrite the system prompt to the developer role for
     * reasoning models. Self-hosted relays get an explicit false (their
     * upstreams reject role:developer); official endpoints keep pi-ai's own
     * detection default by omitting the field.
     */
    supportsDeveloperRole?: boolean;
    /**
     * Anthropic-messages protocol only: force adaptive thinking so the
     * declared efforts dispatch as `output_config.effort` instead of falling
     * into the older budget-based thinking path. pi-ai offers this field on
     * exactly the anthropic-messages compat gate, and the oracle models that
     * take an effort ladder all have adaptive thinking.
     */
    forceAdaptiveThinking?: boolean;
    thinkingTokenBudgetField?: ThinkingTokenBudgetField;
    supportsThinkingTokenBudget?: boolean;
    vllmPriority?: number;
    supportsMaxOutputTokens?: boolean;
}
export declare const NEW_COMPAT_KEYS: readonly ["thinkingTokenBudgetField", "vllmPriority", "supportsMaxOutputTokens"];
/** One knowledge-base entry: which model families it matches and what to declare. */
export interface KnowledgeEntry {
    /** Stable id (also used to de-duplicate user overrides). */
    id: string;
    /** Model id/name patterns (lowercase substring match). */
    patterns: readonly string[];
    /**
     * Level set + wire spellings to declare. `false` marks a family the
     * official catalog serves WITHOUT any reasoning control (GPT-4o / GPT-4
     * generations): suggesting a ladder there would have the composer send
     * reasoning_effort and get a 400 from the real endpoint.
     */
    efforts: ReasoningEfforts | false;
    /** Optional compat block to declare alongside the efforts. */
    compat?: CompatSuggestion;
    /**
     * The model family takes an effort ladder on the anthropic-messages
     * protocol too: pi-ai only routes declared efforts to `output_config.effort`
     * when `forceAdaptiveThinking` is set, so this pin adds that compat block
     * on anthropic-messages routes (and nothing on any other protocol).
     */
    anthropicAdaptive?: boolean;
    /**
     * Request modalities to declare, in core vocabulary. Absent = no modality
     * suggestion for this family. Wider support a gateway may serve (pdf,
     * audio, video) is recorded in 'note' until the core vocabulary grows.
     */
    input?: InputModalities;
    /**
     * Reference context window in tokens (display-only advice; the official
     * capacity inputs are never auto-filled).
     */
    contextWindow?: number;
    /** Reference max output tokens in tokens (display-only advice). */
    maxTokens?: number;
    /**
     * The vendor's own default level for the family, when its docs name one
     * (the same research pass that recorded the ladders). Consumed by the
     * client's effort memory as the model-switch fallback: a switch to a model
     * with no remembered level re-applies the vendor default instead of leaving
     * the session on the host's "Default" (no-effort) state. Never guessed --
     * entries whose docs publish no default simply carry none.
     */
    defaultEffort?: ThinkingLevel;
    /** Human note shown next to the suggestion (localized by the caller). */
    note?: string;
}
/** What a provider route names about itself that inference can use. */
export interface RouteFacts {
    /** Wire protocol as configured ('api'), if any. */
    api?: string;
    /** Endpoint URL, if any. */
    baseURL?: string;
    /** Display name, if any. */
    displayName?: string;
}
/** The endpoint facts a suggestion fuses, as the probe route reports them. */
export interface EndpointFacts {
    /** Tri-state reasoning signal: true / false / 'unknown' (listing silent). */
    reasoning: boolean | 'unknown';
    /** The listing field that produced the reasoning signal, null when none did. */
    source: string | null;
    /**
     * The listing's input-modality disclosure, normalized to lowercase strings,
     * when the listing named such a field at all. Present-but-empty means the
     * field existed with no usable members; absent means the listing never
     * spoke about modalities (or the probe never ran) -- the tri-state
     * discipline: silence is not refusal.
     */
    input?: readonly string[];
    /** Context length the listing disclosed, when it carries one. */
    contextLength?: number;
}
/** How a suggestion's input-modality part was derived. */
export type InputSource = 'knowledge' | 'endpoint' | 'heuristic';
/** A resolved suggestion for one model on one route. */
export interface EffortSuggestion {
    /**
     * The reasoning-effort declaration to write, if one is derivable. False
     * arrives when the endpoint explicitly reports the model does not reason.
     */
    efforts?: ReasoningEfforts | false;
    /**
     * The vendor's own default level for the model, when the knowledge base
     * names one and the suggested ladder carries it. The effort memory uses it
     * as the model-switch fallback (see {@link KnowledgeEntry.defaultEffort}).
     */
    defaultEffort?: ThinkingLevel;
    /** The compat block to write alongside, if any. */
    compat?: CompatSuggestion;
    /** Request modalities to declare, when derivable. */
    input?: InputModalities;
    /** Where the modality part came from -- its confidence rides this. */
    inputSource?: InputSource;
    /** Reference context window (display-only; never auto-filled anywhere). */
    contextWindow?: number;
    /** Reference max output tokens (display-only). */
    maxTokens?: number;
    /** Whether a knowledge-base entry matched (vs protocol inference). */
    matched: boolean;
    /** The knowledge entry id when one matched. */
    entryId?: string;
    /** Human-readable source of the suggestion. */
    source: string;
    /**
     * Overall confidence for the UI: high = knowledge base (wire values) and/or
     * an explicit endpoint signal; medium = endpoint confirmed reasoning but the
     * level ladder is inferred; low = protocol inference alone.
     */
    confidence: 'high' | 'medium' | 'low';
    /** The endpoint signal behind this suggestion, when one was supplied. */
    endpoint?: {
        reasoning: boolean | 'unknown';
        source: string | null;
    };
}
/**
 * The curated knowledge base. Patterns are lowercase substring matches against
 * the model id (and display name). First match wins, longest pattern wins.
 *
 * Sources of truth (per family; DeepSeek / OpenAI / Anthropic re-checked
 * 2026-09 against their current official docs, the rest 2026-08): official API docs --
 * api-docs.deepseek.com (news/pricing/thinking/vision/API reference),
 * developers.openai.com model pages + guides (platform.openai.com blocked;
 * Azure learn mirror cross-checked), platform.claude.com (effort page,
 * models overview, OpenAI-SDK compatibility page), ai.google.dev (thinking +
 * OpenAI-compat pages), docs.x.ai (model pages + reasoning capability),
 * docs.bigmodel.cn (thinking + model pages), platform.kimi.com (models /
 * use-thinking-models / use-reasoning-effort), platform.stepfun.com (model
 * pages + reasoning), docs.byteplus.com / volcengine ModelArk (deep
 * reasoning), cloud.baidu.com (Qianfan pricing/thinking model list),
 * plus first-party GitHub cards (openai/gpt-oss, mistralai/mistral-common,
 * Tencent-Hunyuan/Hy3, MiniMax-AI/MiniMax-M3) -- cross-checked against the
 * public OpenRouter catalog (input_modalities, supported_parameters) where
 * noted. Capacities are REFERENCE values: aggregators disagree, so the note
 * says so where the spread is wide, and families whose numbers stay contested
 * simply carry none.
 */
export declare const KNOWLEDGE_BASE: readonly KnowledgeEntry[];
/**
 * The generic OpenAI-compatible ladder -- the single source for every
 * OpenAI-shaped protocol row below and the fallback when nothing matches.
 */
export declare const GENERIC_OPENAI_EFFORTS: ReasoningEfforts;
/**
 * Level sets keyed by pi-ai's REAL wire protocols -- the only values a
 * route's 'api' may take are 'openai-completions' | 'openai-responses' |
 * 'anthropic-messages' (llm-pi-ai provider.ts PROTOCOLS) -- plus the
 * 'deepseek' URL dialect for routes that name no api but point at DeepSeek's
 * own endpoint, which takes its native off/high/max ladder.
 *
 * 'off: null' is only offered where a no-thinking mode is plausible; the
 * conservative choice elsewhere is to omit it so the picker never promises an
 * Off the endpoint would reject. Exported for the vocabulary grid tests that
 * pin these ladders against pi-ai's resolution rules.
 */
export declare const PROTOCOL_INFERENCE: Readonly<Record<string, ReasoningEfforts>>;
/** Match the knowledge base: first match wins, longest boundary hit wins. */
export declare function matchKnowledgeBase(modelId: string, displayName?: string): KnowledgeEntry | undefined;
export declare function inferProtocol(route: RouteFacts): string;
/** Whether a baseURL names a self-hosted endpoint (loopback, private LAN, .local, custom port). */
export declare function isSelfHostedEndpoint(baseURL: string | undefined): boolean;
/** Drop catalog-withheld keys pi-ai never accepts from a profile (defensive). */
export declare function sanitizeCompatForProtocol(compat: CompatSuggestion, api: string): CompatSuggestion | undefined;
/**
 * Whether a route is a self-hosted relay whose upstreams cannot be assumed
 * to accept role:developer: openai-completions protocol on a baseURL whose
 * host no official root claims. Absent or malformed URLs answer false --
 * with nothing to judge the host by, pi-ai's detection default stands.
 */
export declare function isSelfHostedRelay(route: RouteFacts): boolean;
/** Lowest-confidence modality guess from the model id alone, or undefined. */
export declare function inferModalitiesFromName(modelId: string): InputModalities | undefined;
/**
 * Resolve the suggestion for one model on one route, fusing the available
 * signals by confidence:
 *
 *   L1  endpoint listing signal (when supplied) -- answers "does it reason at
 *       all" and, independently, "what does it accept": an explicit false
 *       wins the effort ladder outright (suggest false, high); a modality
 *       disclosure or a context length feeds those parts regardless;
 *   L2  knowledge base -- the ONLY source of wire spellings and compat, plus
 *       modality/capacity references when the endpoint stays silent;
 *   L3  name heuristic -- a low-confidence image guess for vision-flavored
 *       ids when both sources above are silent;
 *   L4  protocol inference -- level-ladder skeleton when nothing better exists.
 *
 * @param modelId - the model id (or display name) to match.
 * @param route - route facts used when the knowledge base misses; its
 *   displayName participates in knowledge-base matching.
 * @param endpoint - optional raw-listing facts for this model (from the
 *   host's same-origin probe route); omit when the endpoint was not asked.
 * @returns a suggestion (always derivable -- protocol inference has a fallback).
 */
export declare function suggestEfforts(modelId: string, route: RouteFacts, endpoint?: EndpointFacts): EffortSuggestion;
