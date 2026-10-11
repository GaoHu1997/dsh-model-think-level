/**
 * Request-level header bridge for the pi-ai-backed Harness adapter.
 *
 * The model-list probe has its own direct fetch path, but conversation requests
 * are assembled inside dsh-llm-pi-ai and then passed to pi-ai's Models service.
 * pi-ai exposes `transformHeaders` exactly after auth and request headers have
 * been merged, so it is the right place to restore the profile values that the
 * Harness attribution layer reserves (most visibly `user-agent`).
 *
 * dsh-llm-pi-ai does not expose its private Models collection through a public
 * plugin API. Its adapter is nevertheless registered in the public llm runtime,
 * and the runtime object keeps that registration in a normal `adapters` Map. The
 * bridge uses a narrow structural adapter of that implementation detail and
 * fails open for other adapters or older runtimes.
 *
 * @module dsh-model-think-level/headers-pi-ai
 */
import { type HeaderIndex } from './headers-core.js';
/** A live route index shared with the fetch overlay. */
export interface PiAiHeaderSource {
    current: HeaderIndex;
}
/** Handle returned for one adapter patch. */
export interface PiAiHeaderTransformHandle {
    readonly active: boolean;
    dispose(): void;
}
/** Install the request-level transform on one pi-ai-shaped adapter. */
export declare function installPiAiHeaderTransform(adapter: unknown, source: PiAiHeaderSource): PiAiHeaderTransformHandle;
/** Diagnostic snapshot of the bridge's live attach state. */
export interface PiAiHeaderBridgeState {
    runtimeFound: boolean;
    registerPatched: boolean;
    adaptersInRuntime: number;
    adaptersPatched: number;
    adapters: string[];
    routes: number;
    overrides: number;
}
/**
 * Describe what the bridge is currently attached to. Read-only; used by the
 * probe route's `?diag=1` arm to make the request-header takeover observable
 * from the running host instead of only from a test harness.
 */
export declare function describePiAiHeaderState(llm: unknown, source: PiAiHeaderSource): PiAiHeaderBridgeState;
/**
 * Install the bridge on every current pi-ai-shaped registration and expose a
 * refresh for the runtime's `llm/adapters-updated` event.
 */
export interface PiAiHeaderTransformsHandle {
    refresh(): void;
    dispose(): void;
}
export declare function installPiAiHeaderTransforms(llm: unknown, source: PiAiHeaderSource): PiAiHeaderTransformsHandle;
