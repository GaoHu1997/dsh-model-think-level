/**
 * The provider-card slot registration: the seat the request-header editor
 * (issue #12) renders in.
 *
 * `settings.models.provider-card` is a KEYED slot declared by the official
 * Models section, dispatched on each card's owning settings namespace
 * (`ProviderDirectoryEntry.settingsNs`). Registering under `llm-pi-ai` is
 * therefore all it takes to receive every card of this adapter family — the
 * shipped routes, the ones the user adds, and the hand-declared ones alike —
 * without a DOM anchor, a mutation observer, or a label to match on.
 *
 * The ROUTE is not a registration-time fact: the section passes each occurrence
 * its directory row as owner props, so the route arrives on the component at
 * render time and one registration serves every card.
 *
 * The mount also hosts the editor's tab bar ({@link EditorTabBar}) and is the
 * element the editor-tabs pass resolves its card from, so the plugin's own
 * subtree is what carries both the takeover's control and the state the
 * stylesheet reveals the section on.
 *
 * @module dsh-model-think-level/client/injection/provider-card-slot
 */
import type { ReactNode } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ClientContext, RemoteApi } from '../types.js';
/**
 * The occurrence props the official Models section hands one provider-card
 * extension (its own `ProviderCardExtrasOwnerProps`). Declared structurally for
 * the same reason as {@link SlotRegistrarFace}: the plugin pins only what it
 * reads, so a field the section adds cannot break activation.
 */
interface ProviderCardOccurrence {
    /** The card's directory row; `provider` is the settings route key. */
    provider?: {
        provider?: string;
    };
}
/** Props the occurrence component receives: the section's share plus ours. */
export type ProviderCardSlotProps = ProviderCardOccurrence & {
    api: RemoteApi;
    t: Translate;
};
/**
 * The occurrence component: resolve this card's route, render the editor with
 * its tab bar, and publish the card's open/closed state so the section reveals
 * itself with the official editor. Exported for its own tests (the registration
 * below is the production path).
 */
export declare function ProviderCardSlot({ provider, api, t }: ProviderCardSlotProps): ReactNode;
/**
 * Take the provider-card seat.
 * @param ctx - client root context (its `slots` service registers the seat).
 * @param api - the settings Remote the editor reads and writes through.
 * @param t - the plugin's locale-bound translator.
 * @returns the seat's disposer, or a no-op when the seat is unavailable.
 */
export declare function registerProviderCardSlot(ctx: ClientContext, api: RemoteApi, t: Translate): () => void;
export {};
