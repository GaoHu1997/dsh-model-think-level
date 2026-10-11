/**
 * The provider-card request-header editor (issue #12, MVP-1) — the fetch-layer
 * `user-agent` takeover is its MVP-2 half, rendered in the same section because
 * to the user they are one thing: "what this route sends".
 *
 * Mounted through the OFFICIAL seat, `settings.models.provider-card`, which the
 * Models section dispatches per provider card. That is a sanctioned extension
 * point, so unlike the per-model effort editor this component needs no DOM
 * injection, no mutation observer and no anchor labels.
 *
 * Write discipline: the draft is a whole dict and only the explicit Save writes
 * it, so an edit can never race a stale snapshot of the same card the way
 * per-keystroke writes would — and Cancel/Reload behaves like the official
 * card's own fields. The headers land through `llm-pi-ai.providers.<route>.headers`,
 * the one channel the adapter actually sends.
 *
 * @module dsh-model-think-level/HeadersEditor
 */
import type { ReactNode } from 'react';
import type { RemoteApi } from './types.js';
/** The fixed fetch-layer report the host route serves. */
export interface HeaderEnvironment {
    /** Whether the fetch-layer takeover is enabled in this deployment. */
    enabled: boolean;
    /** Whether the plugin's wrapper currently owns the global fetch. */
    installed: boolean;
    /** Routes whose configured request headers are sent. */
    overrides: {
        origin: string;
        route: string;
        headers: Record<string, string>;
        userAgent?: string;
    }[];
    /** Origins two routes claim with different User-Agent values. */
    conflicts: {
        origin: string;
        routes: string[];
        values: string[];
    }[];
    /** Same-origin differences for any configured header. */
    headerConflicts?: {
        origin: string;
        header: string;
        routes: string[];
        values: string[];
    }[];
    /** What was found of the plugins rewriting the same surface. */
    environment: {
        adapter: 'patched' | 'stock' | 'unknown';
        siblings: {
            name: string;
            path: string;
        }[];
        preferOfficialLayer: boolean;
    };
}
/** Props of {@link HeadersEditor}. */
export interface HeadersEditorProps {
    /** The provider route this card edits. */
    route: string;
    /** The write seam. */
    api: RemoteApi;
    /** Localized copy. */
    t: (key: string, params?: Record<string, string | number>) => string;
}
/** One editable header row; a stable `id` keeps React keys off the name. */
interface DraftRow {
    id: number;
    name: string;
    value: string;
}
/** A draft as the editor holds it: every configured header is one row. */
interface Draft {
    rows: DraftRow[];
    /** Legacy input accepted by headersFromDraft callers; the UI no longer uses it. */
    userAgent?: string;
}
/** The headers dict a draft stores: blank names are dropped. */
export declare function headersFromDraft(draft: Draft): Record<string, string>;
/**
 * Render the provider card's request-header section.
 * @param props - route identity, write seam and copy.
 * @returns the section.
 */
export declare function HeadersEditor({ route, api, t }: HeadersEditorProps): ReactNode;
export {};
