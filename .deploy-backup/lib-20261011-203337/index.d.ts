/**
 * Host half of dsh-model-think-level.
 *
 * One job: settings auto-adaptation. Whenever the `llm-pi-ai` section gains a
 * hand-declared model that carries no `reasoningEfforts`, fill one in from the
 * knowledge base + protocol inference (see {@link suggestEfforts}). The fill
 * is a *suggestion* written to the user layer — the user can still edit it on
 * the Models page — and a model that already declares efforts, or an explicit
 * `false`, is never touched. All interactive editing (per-model editors and
 * per-model auto-adapt) lives in the browser half, which reuses the same
 * knowledge base as a pure module.
 *
 * @module dsh-model-think-level
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { buildAutofillPatch } from './autofill.js';
/** Re-exported so the package entry keeps naming the patch builder. */
export { buildAutofillPatch };
/** Stable plugin id, matching the cordis.patch.yml row and the bundle id. */
export declare const name = "dsh-model-think-level";
/** Hard dependencies: the loader waits for these before calling apply. */
export declare const inject: string[];
/**
 * Plugin configuration, supplied through the profile's cordis layer
 * (the row's `config:` block). Every tunable two deployments may want
 * to set differently lives here rather than as a code constant.
 */
export interface Config {
    /** Auto-fill undeclared pi-ai models on boot and after settings updates (default true). */
    autofill?: boolean;
    /**
     * Whether the auto-fill above also fills the input-modality declaration
     * (default true). Effort auto-fill is governed by {@link autofill} alone.
     */
    modalityAutofill?: boolean;
    /** Upstream fetch timeout for the raw /models probe route, in milliseconds (default 15000). */
    probeTimeoutMs?: number;
    /**
     * Boot-fill retry backoff schedule in milliseconds; an empty list means
     * "try exactly once" (default [1000, 2000, 4000, 8000, 16000, 30000]).
     */
    bootRetryDelaysMs?: number[];
    /**
     * Rewrite effort-less calls to forced-thinking ladders into the ladder's
     * vendor default (default true). Only the request class that today becomes
     * `thinking: {type: disabled}` on a ladder that cannot switch thinking off
     * is rewritten (issue #2); everything else passes through byte-identical.
     */
    defaultGuard?: boolean;
    /**
     * Take over the configured request headers at the fetch layer for every route
     * whose `headers` declare one (default true). The official adapter may merge
     * attribution headers over profile values, so the overlay reapplies the
     * profile dictionary before the request reaches the wire. The historical
     * `uaOverride` name is retained for configuration compatibility.
     */
    uaOverride?: boolean;
}
/** Schemastery schema: Cordis validates the row config and fills defaults before apply(). */
export declare const Config: Schema<Config>;
/**
 * Compose the raw-models probe request's headers, mirroring the discipline of
 * the harness's own model discovery: the provider
 * profile's configured request headers form the base (deployment-owned
 * credentials like `x-api-key` ride along), `accept` is always JSON, and a
 * resolved credential's Bearer overwrites a profile `authorization` — which
 * survives only when no credential resolves (a route may authenticate through
 * its configured headers alone). Anthropic Messages answers through
 * `x-api-key` plus a fixed `anthropic-version`, and its Bearer arm is never
 * used (a profile `authorization` survives untouched there, exactly as the
 * official discovery leaves it). Entries Fetch would refuse are dropped
 * rather than failing the probe. Harness attribution headers are deliberately
 * not sent — this is a same-origin diagnostic, not a harness request.
 * @param profileHeaders - the profile's raw `headers` dict (simply absent
 *   on older documents).
 * @param apiKey - the resolved credential, when one resolved.
 * @param api - the profile's wire protocol.
 */
export declare function composeProbeHeaders(profileHeaders: unknown, apiKey: string | undefined, api: string): Record<string, string>;
/**
 * Apply the plugin: autofill undeclared models on boot and after every commit
 * that touches the pi-ai namespace.
 * @param ctx - host context.
 */
export declare function apply(ctx: Context, config?: Config): void;
