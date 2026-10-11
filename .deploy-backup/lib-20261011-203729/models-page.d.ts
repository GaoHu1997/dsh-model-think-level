/**
 * The Models-page DOM injection.
 *
 * Owns the document-wide MutationObserver, the debounced scan, the retry
 * backoff, the editor mounts, the host-label anchors and the ledger teardown.
 * The scan itself is `reconcile()` from the editor injector; this module is the
 * wiring and the lifecycle around it.
 *
 * The composer path is NOT this module's business: the caller hands `start()`
 * a synchronous hook that runs on every mutation burst BEFORE the debounced
 * scan, because the composer body must land before the first paint while the
 * settings-page scan does heavy wire reads.
 *
 * @module dsh-model-think-level/client/injection/models-page
 */
import type { ReactNode } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import { type HostLabels, type ScanState } from './models-page-editor.js';
import type { ClientContext, RemoteApi } from '../types.js';
/** What the Models-page injection needs from its host. */
export interface ModelsPageDeps {
    /** The client root context. */
    ctx: ClientContext;
    /** The settings remote the editors read and write through. */
    api: RemoteApi;
    /** The plugin's locale-bound translator. */
    t: Translate;
    /** Run once per idle pass, after everything the session held back landed. */
    onIdle: () => void;
    /** Wrap a subtree so it re-translates on a language switch. */
    refreshed: (children: () => ReactNode) => ReactNode;
}
/** The Models-page injection's face. */
export interface ModelsPageInjection {
    /** The live scan state (the ledger teardown drains it). */
    readonly state: ScanState;
    /** The host label anchors in the host's ACTIVE language. */
    labels: () => HostLabels;
    /**
     * Begin observing. `onComposerMutation` runs synchronously on every mutation
     * burst, before the debounced scan.
     */
    start: (onComposerMutation: () => void) => void;
    /** Disconnect the observer, cancel pending timers, stop the scan chain. */
    stopObserver: () => void;
    /** Land the held writes and unmount every editor; the fiber is going away. */
    teardown: () => void;
    /** Land only the committed writes and discard the rest (page unload). */
    flushOnUnload: () => void;
    /** Force a rescan (document update, connection reset, preference flip). */
    schedule: () => void;
}
/**
 * Build the Models-page injection.
 * @param deps - context, settings remote, copy, idle hook and locale refresh.
 * @returns the injection's {@link ModelsPageInjection} face.
 */
export declare function createModelsPage(deps: ModelsPageDeps): ModelsPageInjection;
