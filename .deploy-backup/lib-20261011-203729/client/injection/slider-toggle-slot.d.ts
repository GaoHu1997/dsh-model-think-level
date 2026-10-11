/**
 * The Models-page footer slot: the boxed composer-slider toggle.
 *
 * The Models page ships the sanctioned 'settings.models.footer' extension slot
 * after the provider rows and the add controls, and the plugin's top-level
 * inject already declares 'remote.settings' — its wired contract on this
 * kernel — so the toggle takes that seat unconditionally; no DOM fallback
 * exists.
 *
 * @module dsh-model-think-level/client/injection/slider-toggle-slot
 */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ClientContext } from '../types.js';
/**
 * Take the official footer seat.
 * @param ctx - client root context (its `slots` service registers the seat).
 * @param t - the plugin's locale-bound translator.
 */
export declare function registerSliderToggleSlot(ctx: ClientContext, t: Translate): () => void;
