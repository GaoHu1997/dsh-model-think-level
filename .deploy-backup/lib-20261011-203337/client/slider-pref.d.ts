/**
 * The reasoning-effort slider preference: a session-scoped localStorage-backed
 * enable flag, deliberately NOT settings.yaml (it is a UI preference, like the
 * upstream plugin's toggle it replaces). Defaults to enabled, but the initial
 * read migrates the UPSTREAM plugin's keys (dsh-reasoning-effort.enabled / the
 * @dsh-external legacy one) so a user who had switched the upstream slider off
 * does not suddenly get it back.
 *
 * @module dsh-model-think-level/client/slider-pref
 */
/** localStorage key (own namespace; the upstream plugin's keys stay untouched). */
export declare const SLIDER_PREF_KEY = "dsh-model-think-level.slider.enabled";
/** Snapshot the current preference. */
export declare function sliderEnabled(): boolean;
/** Save the preference (persisted immediately; a failed write keeps the session value). */
export declare function setSliderEnabled(next: boolean): void;
/** Apply a value incoming from another tab (no persist: the writer already stored it). */
export declare function syncSliderEnabled(next: boolean): void;
/** Subscribe to preference changes; returns the disposer. */
export declare function subscribeSliderEnabled(listener: () => void): () => void;
