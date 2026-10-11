/**
 * Shape guards and settings-dict readers shared by the host and browser
 * halves. Pure data logic only: esbuild inlines this module into both
 * bundles, so it must never import a harness package or touch DOM/node APIs.
 *
 * @module dsh-model-think-level/shared
 */
import type { RouteFacts } from './knowledge.js';
/** Whether a value is a plain-ish object (not null, not an array). */
export declare const isRecord: (value: unknown) => value is Record<string, unknown>;
/**
 * Whether a settings refusal reads like "this kernel does not know the newer
 * compat keys". The host autofill and the browser write path each downgrade
 * once on this signal, so they must answer identically.
 */
export declare function looksLikeCompatRefusal(message: string): boolean;
/** The models array of one route in a providers dict, as records. */
export declare function modelsOf(providers: unknown, route: string): Record<string, unknown>[];
/** One provider profile's route facts, as suggestion inference reads them. */
export declare function routeFactsOf(providers: unknown, route: string): RouteFacts;
