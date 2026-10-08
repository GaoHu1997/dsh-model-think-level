/**
 * Stylesheet for the injected editor. Deliberately tiny
 * and self-contained: it is injected into the settings panel and must not
 * collide with the official Models page classes, so every selector is prefixed
 * `bre-`. Uses CSS variables for theme awareness where the host provides them.
 */

/** The stylesheet text, inserted once into <head> by the client apply(). */
export const STYLES = `
/* The injector's mount wrapper. It — not the editor inside it — is the item
   placed into the official row disclosure's repeat(auto-fit, minmax(160px,1fr))
   grid (context window and max tokens take two cells), so the span belongs
   here: on the editor itself it would target the wrapper's block box and be
   ignored, squeezing the block into one cell. */
.bre-effort-slot {
  grid-column: 1 / -1;
}
/* The slot wrapper is a plain column: the master thinking switch sits in it,
   directly above the card it gates. */
.bre-effort-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 4px;
}
/* The 思考强度 card proper — rendered only while the master switch is on. */
.bre-effort-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  box-sizing: border-box;
}
.bre-effort-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bre-effort-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.bre-link-button {
  background: none;
  border: none;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--dsw-alias-link);
  cursor: pointer;
  border-radius: 4px;
}
.bre-link-button:hover { text-decoration: underline; }
.bre-link-button:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
.bre-auto-effort {
  /* Seated in the OFFICIAL catalogue head, among the host's own controls, so it
     wears THEIR metrics instead of the plugin's blue underlined link look
     (user request: "不要超链接样式，跟另外两个保持一致"). These values mirror
     the host's own linkButton rule; the seat cannot simply take that class,
     because it would then answer the probe that finds the anchor it sits after.
     No extra margin: the head's own 12px gap already spaces it exactly like the
     controls beside it. */
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  flex: none;
}
.bre-auto-effort:hover {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
  color: var(--dsw-alias-label-secondary, #374151);
}
.bre-effort-grid {
  /* Exactly two equal columns mirroring the official capacity pair the editor
     sits under; an odd row count leaves the last cell in the left column,
     so the left side carries the extra level. */
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 16px;
}
.bre-effort-row {
  display: grid;
  grid-template-columns: 20px 76px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.bre-effort-row input[type='checkbox'] {
  /* Bigger than the browser default (~13px): a tap/point target that does
     not require precision, in the theme accent when checked. */
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.bre-effort-level { color: var(--dsw-alias-label-tertiary); }
.bre-effort-wire {
  box-sizing: border-box;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.bre-effort-wire:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.bre-effort-empty { min-height: 24px; }
.bre-effort-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.bre-secondary-button {
  height: 26px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 0.5px solid var(--dsw-alias-border-l3);
}
.bre-secondary-button:disabled { opacity: 0.5; cursor: default; }
.bre-secondary-button { background: transparent; color: inherit; }
.bre-effort-message { font-size: 12px; margin: 0; }
.bre-effort-message.bre-error { color: #c62828; }
.bre-effort-message.bre-info { color: var(--dsw-alias-link); }
.bre-effort-note { font-size: 11px; margin: 0; color: var(--dsw-alias-label-tertiary); }
/* ---- Input-modality section ---- */
.bre-modality {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bre-modality-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.bre-modality-row input[type='checkbox'] {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.bre-modality-clear { margin-left: auto; }
.bre-modality-note { font-size: 11px; margin: 0; color: var(--dsw-alias-label-tertiary); }
/* The master thinking switch, which lives OUTSIDE the card it gates: with it
   off that card is not rendered at all, so nothing here has to be hidden. */
.bre-thinking-switch { margin: 0; }
/* ---- Endpoint-compatibility controls ----
   Same shape as the official capacity fields the editor sits under: a caption
   above the control, the control capped at the official enum width (a field
   width dropdown reads as a text field the user is expected to fill), and a
   hint line beneath. Tokens are the official ones — the plugin's own --dsh-*
   names are defined nowhere in this app, so their light-mode literals used to
   render in both themes. */
.bre-compat {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bre-compat-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.bre-compat-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bre-compat-label {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.bre-compat-hint {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.bre-select, .bre-text-input {
  box-sizing: border-box;
  width: 100%;
  max-width: 240px;
  height: 32px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
}
.bre-text-input::placeholder { color: var(--dsw-alias-label-dimmed); }
.bre-select:focus, .bre-text-input:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.bre-select:disabled, .bre-text-input:disabled { opacity: 0.6; cursor: default; }
.bre-select {
  cursor: pointer;
  /* The OS arrow sits flush against the right edge; the official select swaps
     it for the shared 12px chevron inset on the same right pad. Data-URI SVGs
     cannot resolve CSS variables, so the stroke is the caption gray both
     themes share. */
  appearance: none;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 12px 12px;
}
.bre-error { color: var(--dsw-alias-state-error-primary); }
/* ---- Zoned suggestion display ---- */
.bre-suggestion {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bre-reference {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  padding: 6px 8px;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.bre-reference-title { font-weight: 600; }
.bre-reference-values { display: inline-flex; gap: 14px; }
/* ---- Composer model-menu slider (mounted inside the OFFICIAL menu) ----
   Visuals ported VERBATIM from HanaAyane's dsh-reasoning-effort (MIT) — the
   only deliberate difference is the chibi-runner "big fish" knob, which is
   dropped so the knob is always the white circle. Class names are re-
   prefixed bre- (the upstream's re- prefix would clash while both plugins
   are installed); every color/size/animation value stays upstream's. */
.bre-slider-body {
  /* The replicated popover body. The official menu shell carries padding: 4px
     (ModelSelect.module.css), so pull the replica flush to the box. overflow
     stays VISIBLE: an open list is laid out inside the body, so nothing ever
     has to escape it, and the rows' own hover radius needs no clipping. */
  overflow: visible;
  margin: -4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* The official menu is content-sized; while the replicated popover body is
   live, its box takes the upstream .re-model-menu width. The class is added
   by the mount and removed when the slider is switched off. */
.bre-model-menu-host {
  width: min(340px, calc(100vw - 32px));
  min-width: 0;
}
/* The official trigger keeps ownership of its model/effort children. The
   provider prefix is a pseudo-element so host React updates, focus handling and
   the click target remain untouched.

   Scoped to the composer, which owns the only button that carries this stamp.
   The settings sidebar's account button is ALSO an [aria-haspopup="menu"]
   button, so an unscoped rule paints the prefix onto the account row the
   moment a stale stamp lands there — and a stamp that escaped the composer
   must render nothing rather than relabel a host control. The seat anchor is
   listed too, so a shell that renders the trigger outside the card body still
   gets the prefix. */
[data-composer-card] button[data-bre-provider]::before,
[data-slot="conversation.input.model"] button[data-bre-provider]::before {
  content: attr(data-bre-provider) " · ";
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-weight: 400;
  white-space: nowrap;
}

/* ---- Model / reasoning-level rows ----
   Presentation follows dsh-tauri-model-config's settings rows
   (src/client/models/styles.ts: .zGbnIq_rowCard / .zGbnIq_rowHead /
   .zGbnIq_iconButton): hairline separators between rows and a list opening
   under the row it belongs to. Re-prefixed bre- and routed through the tokens
   this file already uses. */
/* Layout only — it deliberately paints NO background, border, radius or
   overflow clip. The replica is mounted inside the OFFICIAL menu, and that
   shell already draws its own surface (MenuSurface: a [data-menu-material]
   panel whose .material child paints --dsw-menu-surface-fill, i.e.
   --dsw-specific-menu, under backdrop-filter: var(--dsw-menu-backdrop-filter),
   rounded by --dsw-radius-lg and outlined by --dsw-elevation-prominent).
   A second opaque card in here shows that official surface as a grey frame
   around it — two stacked surfaces where every other menu in the app has one. */
.bre-card {
  display: flex;
  flex-direction: column;
}
.bre-row-control {
  appearance: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  /* Matches the official menu cells (.u91W7W_cell / .u91W7W_option use
     --dsw-radius-md, 8px here) and the .bre-option rows below, now that the
     surface behind the rows is the menu's own and hover is no longer clipped
     by a card. */
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
}
.bre-row-control:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(120, 125, 140, .09));
}
.bre-row-control.is-open { background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09)); }
.bre-row-control:disabled { cursor: default; opacity: .6; }
.bre-row-control:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3);
}
.bre-row-label {
  flex: none;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.bre-row-value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.bre-row-value.is-muted { font-weight: 400; color: var(--dsw-alias-label-tertiary); }
.bre-divider { height: 1px; margin: 0 10px; background: var(--dsw-alias-border-l4); }
.bre-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  padding: 2px 6px 8px;
}
/* Provider column + model column of the model list, side by side. The height is
   FIXED: switching provider must not resize the card, or every click would need
   another same-frame re-place and any missed one shows as a jump. */
.bre-panel-models {
  flex-direction: row;
  align-items: stretch;
  gap: 0;
  height: 240px;
  max-height: none;
  overflow: hidden;
  padding: 4px 6px 8px;
}
.bre-providers {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 112px;
  overflow-y: auto;
  padding-right: 2px;
}
.bre-provider-models {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  margin-left: 6px;
  padding-left: 6px;
  border-left: 1px solid var(--dsw-alias-border-l4);
}
.bre-option,
.bre-provider {
  appearance: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
/* The provider cell carries its chevron hard against the right edge. */
.bre-provider { gap: 4px; padding: 0 4px 0 8px; }
.bre-option:hover:not(:disabled),
.bre-provider:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(120, 125, 140, .09));
}
.bre-option:disabled,
.bre-provider:disabled { cursor: default; opacity: .6; }
.bre-option:focus-visible,
.bre-provider:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3);
}
.bre-option-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bre-option.is-active {
  color: var(--dsw-static-deepseek-500, #4d70ff);
  font-weight: 500;
  background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09));
}
/* The open provider is the highlighted one; the provider of the CURRENT model
   keeps the accent so the column says where the selection lives. */
.bre-provider.is-open { background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09)); }
.bre-provider.is-current .bre-option-name {
  color: var(--dsw-static-deepseek-500, #4d70ff);
  font-weight: 500;
}
.bre-provider .bre-row-chevron { width: 14px; height: 14px; font-size: 14px; }
/* Capability badges on a model row (image input / thinking). Muted so the name
   stays the brightest thing in the row; the badge's own title carries the copy. */
.bre-option-tags {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
}
.bre-option.is-active .bre-option-tags { color: var(--dsw-static-deepseek-500, #4d70ff); }
.bre-tag { display: inline-flex; align-items: center; }
.bre-tag-icon { display: block; width: 13px; height: 13px; }
.bre-option-check { flex: none; width: 14px; height: 14px; }
.bre-empty { padding: 6px 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.bre-slider-advanced {
  /* upstream .re-advanced: the padded area that hosts the slider */
  padding: 14px;
}
.bre-effort {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 32px;
  color: var(--dsw-alias-label-secondary);
  user-select: none;
  box-sizing: border-box;
}
.bre-effort-slider {
  --bre-progress: 50%;
  position: relative;
  width: 100%;
  height: 30px;
  flex: 1 1 auto;
  border-radius: 999px;
  isolation: isolate;
  transition: filter 180ms ease;
}
.bre-effort-track {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background: linear-gradient(100deg, #03040a 0%, #071126 22%, #101d4c 45%, #302262 70%, #5d35a0 100%);
  box-shadow:
    inset 0 1px 0 rgba(189, 199, 255, .15),
    inset 0 -1px 0 rgba(0, 0, 0, .55),
    0 3px 10px rgba(12, 17, 55, .34);
}
.bre-effort-track::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 18% 45%, rgba(82, 130, 255, .12), transparent 24%),
    linear-gradient(90deg, rgba(0, 0, 0, .28), transparent 42%, rgba(168, 113, 255, .12));
  pointer-events: none;
}
.bre-effort-fx {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}
.bre-effort-canvas {
  position: absolute;
  z-index: 2;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 1;
  image-rendering: pixelated;
  mix-blend-mode: screen;
  transition: filter 140ms ease;
}
.bre-effort-flare {
  position: absolute;
  z-index: 3;
  top: 50%;
  left: var(--bre-progress);
  width: 78px;
  height: 46px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 100% 50%, rgba(255,255,255,.96) 0 4%, rgba(188,189,255,.8) 11%, rgba(106,87,255,.5) 28%, rgba(105,31,255,.2) 49%, transparent 74%);
  filter: blur(2px) saturate(1.25);
  mix-blend-mode: screen;
  transform: translate(-100%, -50%);
  transition: left 70ms linear, filter 140ms ease;
  pointer-events: none;
}
.bre-effort-flare::before,
.bre-effort-flare::after {
  content: "";
  position: absolute;
  inset: 50% auto auto 100%;
  border-radius: 999px;
  transform: translate(-50%, -50%);
}
.bre-effort-flare::before {
  width: 52px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(100,160,255,.42), #f1ecff, rgba(193,82,255,.65), transparent);
  box-shadow: 0 0 7px #9b7cff, 0 0 13px rgba(72,132,255,.64);
}
.bre-effort-flare::after {
  width: 1px;
  height: 20px;
  background: linear-gradient(180deg, transparent, rgba(196,190,255,.84), transparent);
  box-shadow: 0 0 7px #9c7cff;
}
.bre-effort-knob {
  position: absolute;
  z-index: 4;
  top: 50%;
  left: clamp(14px, var(--bre-progress), calc(100% - 14px));
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255,255,255,.94);
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 0 0 2px rgba(92,105,255,.12),
    0 0 14px rgba(121,82,255,.48),
    0 2px 7px rgba(0,0,0,.3);
  transform: translate(-50%, -50%);
  transition: left 190ms cubic-bezier(.22,1,.36,1), transform 160ms ease, box-shadow 180ms ease;
  pointer-events: none;
}
.bre-effort-input {
  position: absolute;
  z-index: 5;
  inset: -5px 0;
  width: 100%;
  height: calc(100% + 10px);
  margin: 0;
  opacity: 0;
  cursor: grab;
  touch-action: none;
}
.bre-effort-input:active { cursor: grabbing; }
.bre-effort-input:focus-visible + .bre-effort-knob {
  outline: 2px solid var(--dsw-static-blue-400);
  outline-offset: 2px;
}
.bre-effort.is-dragging .bre-effort-canvas {
  filter: saturate(1.45) brightness(1.28) contrast(1.06);
}
.bre-effort.is-dragging .bre-effort-flare {
  filter: blur(1.5px) saturate(1.6) brightness(1.42);
  transition: none;
}
.bre-effort.is-dragging .bre-effort-knob {
  transform: translate(-50%, -50%) scale(1.07);
  transition: none;
  box-shadow:
    0 0 0 3px rgba(113,115,255,.25),
    0 0 20px rgba(74,145,255,.86),
    0 0 31px rgba(171,53,255,.66),
    0 3px 8px rgba(0,0,0,.32);
}
.bre-effort-slider[data-top] .bre-effort-track {
  animation: bre-effort-dark-breathe 1.9s ease-in-out infinite;
}
.bre-effort-slider[data-top] .bre-effort-knob {
  box-shadow:
    0 0 0 3px rgba(119,99,255,.18),
    0 0 22px rgba(135,78,255,.76),
    0 0 34px rgba(53,121,255,.34),
    0 3px 8px rgba(0,0,0,.3);
}
.bre-effort.is-error .bre-effort-slider {
  outline: 1px solid var(--dsw-alias-state-error-secondary);
  outline-offset: 2px;
}
.bre-effort.is-busy { opacity: .72; }
.bre-effort-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
body:not([data-ds-dark-theme]) .bre-effort-slider {
  filter: none;
}
body:not([data-ds-dark-theme]) .bre-effort-track {
  background: var(--dsw-static-blue-75, #e5f0ff);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.9),
    inset 0 0 0 1px rgba(80,133,194,.14),
    0 3px 10px rgba(48,101,165,.13);
}
body:not([data-ds-dark-theme]) .bre-effort-track::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0 auto 0 0;
  width: var(--bre-progress);
  border-radius: inherit;
  background: linear-gradient(90deg, #fff 0%, #e2f0ff 20%, #a8d0fb 57%, #438fdf 100%);
  transition: width 190ms cubic-bezier(.22,1,.36,1);
}
body:not([data-ds-dark-theme]) .bre-effort-slider[data-top] .bre-effort-track::before {
  background: linear-gradient(90deg, #fff 0%, #d7eaff 18%, #75afea 54%, #0751ad 100%);
}
body:not([data-ds-dark-theme]) .bre-effort.is-dragging .bre-effort-track::before {
  transition: none;
}
body:not([data-ds-dark-theme]) .bre-effort-track::after {
  z-index: 1;
  background: linear-gradient(90deg, rgba(255,255,255,.48), transparent 34%, rgba(23,101,201,.07));
}
body:not([data-ds-dark-theme]) .bre-effort-canvas {
  opacity: .78;
  mix-blend-mode: multiply;
}
body:not([data-ds-dark-theme]) .bre-effort-flare {
  background: radial-gradient(ellipse at 100% 50%, rgba(255,255,255,.98) 0 5%, rgba(204,231,255,.88) 13%, rgba(91,162,241,.48) 31%, rgba(37,111,207,.16) 53%, transparent 75%);
  filter: blur(2px) saturate(1.12);
}
body:not([data-ds-dark-theme]) .bre-effort-flare::before {
  background: linear-gradient(90deg, transparent, rgba(116,177,244,.34), #fff, rgba(66,139,225,.58), transparent);
  box-shadow: 0 0 7px rgba(58,133,222,.5), 0 0 13px rgba(104,176,255,.38);
}
body:not([data-ds-dark-theme]) .bre-effort-flare::after {
  background: linear-gradient(180deg, transparent, rgba(255,255,255,.94), transparent);
  box-shadow: 0 0 7px rgba(64,137,224,.44);
}
body:not([data-ds-dark-theme]) .bre-effort-knob {
  border-color: rgba(126,160,197,.32);
  box-shadow:
    0 0 0 2px rgba(58,124,207,.09),
    0 0 13px rgba(48,118,207,.3),
    0 3px 8px rgba(39,77,119,.18);
}
body:not([data-ds-dark-theme]) .bre-effort-slider[data-top] .bre-effort-track {
  animation-name: bre-effort-light-breathe;
}
body:not([data-ds-dark-theme]) .bre-effort-slider[data-top] .bre-effort-knob,
body:not([data-ds-dark-theme]) .bre-effort.is-dragging .bre-effort-knob {
  box-shadow:
    0 0 0 3px rgba(36,105,192,.15),
    0 0 20px rgba(25,100,201,.45),
    0 3px 8px rgba(39,77,119,.18);
}
@keyframes bre-effort-dark-breathe {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(196,204,255,.16), 0 3px 10px rgba(18,25,72,.4); }
  50% { box-shadow: inset 0 1px 0 rgba(220,214,255,.24), 0 0 21px rgba(111,66,255,.5); }
}
@keyframes bre-effort-light-breathe {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,.9), inset 0 0 0 1px rgba(67,124,193,.16), 0 3px 10px rgba(48,101,165,.13); }
  50% { box-shadow: inset 0 1px 0 rgba(255,255,255,.96), inset 0 0 0 1px rgba(31,102,190,.22), 0 0 19px rgba(31,105,201,.24); }
}
.bre-slider-hint {
  /* upstream re-model-status */
  display: block;
  padding: 14px;
  color: var(--dsw-alias-label-tertiary, #9296a0);
  font-size: 12px;
  text-align: center;
}
/* upstream re-model-error: the directory/store error line under the row */
.bre-model-error {
  margin: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--dsw-alias-state-error-primary, #c83e4d);
  background: var(--dsw-alias-state-error-tertiary, rgba(220,55,70,.08));
  font-size: 11px;
}
/* upstream .re-menu-separator */
.bre-menu-separator {
  height: 1px;
  background: var(--dsw-alias-stroke-secondary, rgba(121,126,145,.16));
}
/* upstream .re-model-row: name · current effort › (click → official model list) */
.bre-model-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-height: 45px;
  padding: 0 14px;
  width: 100%;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bre-model-row:hover { background: var(--dsw-alias-fill-tertiary, rgba(120,125,140,.09)); }
.bre-model-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.bre-model-row-effort { color: var(--dsw-static-deepseek-500, #4d70ff); font-size: 12px; }
.bre-row-chevron {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 18px;
  line-height: 1;
  color: var(--dsw-alias-label-tertiary);
  transform: rotate(0deg);
  transition: transform 120ms ease;
}
.bre-row-chevron.is-open { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) {
  .bre-effort-slider[data-top] .bre-effort-track { animation: none; }
  .bre-effort-knob,
  .bre-effort-flare,
  body:not([data-ds-dark-theme]) .bre-effort-track::before { transition: none; }
}
/* ---- Models-page slider toggle (boxed setting item) ----
   Item form ported VERBATIM from upstream .re-setting-row; the surrounding
   box is the requested container (border only, transparent background). */
.bre-slider-setting {
  margin-top: 12px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-stroke-secondary, rgba(121,126,145,.2));
  border-radius: 12px;
  background: transparent;
}
.bre-slider-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  /* Upstream .re-setting-row carries a list bottom border because the general
     settings list held TWO rows (the slider + the big-fish toggle). This box
     holds exactly one, so no divider: the box itself is the container. */
}
.bre-slider-setting-copy { min-width: 0; }
.bre-slider-setting-title {
  color: var(--dsw-alias-label-primary, #15171b);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.bre-slider-setting-description {
  margin-top: 3px;
  color: var(--dsw-alias-label-tertiary, #9296a0);
  font-size: 12px;
  line-height: 18px;
}
.bre-slider-setting-control { display: inline-flex; align-items: center; gap: 10px; flex: none; }
.bre-slider-setting-state { color: var(--dsw-alias-label-secondary, #686c75); font-size: 13px; }
.bre-slider-setting-switch {
  position: relative;
  width: 38px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-fill-quaternary, #c7cbd3);
  cursor: pointer;
  transition: background 150ms ease;
}
.bre-slider-setting-switch:hover { filter: brightness(.97); }
.bre-slider-setting-switch:disabled { cursor: not-allowed; opacity: .45; }
.bre-slider-setting-switch:focus-visible {
  outline: 2px solid var(--dsw-static-blue-400, #5d83ff);
  outline-offset: 2px;
}
.bre-slider-setting-switch.is-on { background: var(--dsw-alias-state-business-primary, #4f73ff); }
.bre-slider-setting-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.2);
  transition: transform 170ms cubic-bezier(.22,1,.36,1);
}
.bre-slider-setting-switch.is-on .bre-slider-setting-switch-knob { transform: translateX(16px); }

/* Model selection search box */
.bre-model-search-box {
  display: flex;
  flex-direction: column;
  padding: 6px 8px 4px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #1e1f22));
}
.bre-model-search-box:has(.bre-search-empty),
.bre-model-search-box.has-empty {
  flex: 1 1 auto;
}
.bre-search-input-wrapper {
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(255, 255, 255, 0.12));
  color: var(--dsw-alias-label-primary);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.bre-search-input-wrapper:focus-within {
  border-color: var(--dsw-static-deepseek-500, #4d70ff);
  box-shadow: 0 0 0 2px rgba(77, 112, 255, 0.2);
}
.bre-search-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  pointer-events: none;
}
.bre-search-icon svg {
  width: 14px;
  height: 14px;
}
.bre-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.bre-search-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #81858c);
  opacity: 0.85;
}
.bre-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #81858c);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.bre-search-clear:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.1));
  color: var(--dsw-alias-label-primary);
}
.bre-search-clear svg {
  width: 12px;
  height: 12px;
}
.bre-search-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  min-height: 180px;
  padding: 24px 16px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 13px;
  line-height: 20px;
  user-select: none;
}

/* ---- Request-header section (issue #12). Mounted through the official
   settings.models.provider-card seat, so it sits in the card's own layout
   rather than a disclosure grid.

   Every value below was MEASURED off the official Models page's own controls
   in DSH 0.1.7-rc.2 rather than guessed, and each is expressed through the same
   --dsw-alias-* token the host paints with, so a theme switch (light/dark)
   repaints this section along with the page:

     provider card   radius 20px, 1px var(--dsw-alias-settings-card-stroke)
     editor action   save = filled var(--dsw-alias-button-primary-fill), h36,
                     radius 12px, 0 14px, 14px; cancel = 1px border, same box
     row action      h28, radius 8px, 0 10px, 12px, 1px border
     text link       h21, radius 4px, 2px 6px, 12px, link-blue label
     text input      radius 12px, 0 10px, 1px var(--dsw-alias-border-l3)  ---- */
/* The provider-card slot's wrapper.
   The official slot mounts us inside a display:contents container, so our own
   root IS a flex item of the card row — and the row lays its children out with
   a 12px gap. A wrapper that stays in the flow while empty therefore adds one
   phantom gap to EVERY card in the list, which is exactly the height regression
   this rule exists to prevent. Collapsed, the wrapper leaves the flow entirely:
   the card renders as it did before the plugin.
   (Deliberately NOT display:contents here — that keeps it a gap-participating
   item, which is the bug this rule fixes.)
   Open, it becomes an ordinary block so the section below can lay itself out.
   data-edit lives HERE — the occurrence component publishes the card's state
   onto its own root, so keying the rule on .bre-headers[data-edit] instead
   would silently never match. */
.bre-headers-host {
  display: none;
}
.bre-headers-host[data-edit="1"] {
  display: block;
}
.bre-headers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* The card lays its own children out with a 12px gap and no dividers; this
     section is an addition to that column, so it separates itself the same way
     the host separates card sections — a hairline on the card's own stroke. */
  border-top: 1px solid var(--dsw-alias-border-l2, #0000001a);
  padding-top: 12px;

  /* Present ONLY while the provider card is being edited.
     The provider list is a list of providers: a request-header row parked in
     every card, collapsed or not, is noise on a surface the user did not ask
     to configure. The card reveals its editor when the user presses its own
     Edit action, and that is the moment this section belongs on screen — the
     same gesture that opens the model list opens this.

     The visibility is decided by the component (which watches the card and
     sets data-edit on the wrapper), not by a selector: the official editor is
     NOT a sibling of this element — its container sits in the card row's own
     children, after the row head and this section's own wrapper — so no
     relative selector can reach it. The wrapper's data-edit is the one fact
     CSS can act on.

     Degradation is safe by construction: with no observer (no card ancestor to
     watch) data-edit stays "0", the section is never revealed, and the
     official page stays clean rather than leaking a row into every card. */
  display: none;
}
.bre-headers-host[data-edit="1"] .bre-headers {
  display: flex;
}
/* The collapsed heading is the section's identity while the card is being
   edited: title, configured count, and the › that opens the details. */
.bre-headers-disclosure {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bre-headers-disclosure:hover .bre-effort-title {
  color: var(--dsw-alias-label-secondary, #61666b);
}
.bre-headers-chevron {
  margin-left: auto;
  padding-right: 2px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 14px;
  line-height: 1;
  transition: transform 150ms ease;
}
.bre-headers[data-open="1"] .bre-headers-chevron { transform: rotate(90deg); }
/* How many entries are configured — the one fact worth showing while closed. */
.bre-headers-count {
  min-width: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}
.bre-headers-head {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
.bre-headers-head .bre-effort-title {
  color: var(--dsw-alias-label-primary, #0f1115);
  font-weight: 600;
}
.bre-headers-edit, .bre-headers-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bre-headers-columns,
.bre-headers-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.9fr) minmax(180px, 1.5fr) 32px;
  align-items: center;
  gap: 8px;
}
.bre-headers-columns {
  padding: 0 10px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 11px;
  line-height: 16px;
}
.bre-headers-row {
  min-height: 40px;
  padding: 4px 6px;
  border: 1px solid var(--dsw-alias-border-l2, #0000001a);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1, #fff);
}
.bre-headers-add {
  align-self: flex-start;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2, #0000001a);
  border-radius: var(--dsw-radius-sm, 8px);
  color: var(--dsw-alias-label-primary, #0f1115);
}
.bre-headers-add:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
.bre-headers-remove {
  width: 32px;
  padding: 0;
  justify-self: center;
}
.bre-headers-rows .bre-headers-name {
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 12px;
  word-break: break-all;
}
.bre-headers-masked {
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0;
}

/* The section's commit/dismiss pair, matching the official editor's own
   actions: a filled commit and a bordered dismiss, 36px tall at 14px. */
.bre-headers-edit .bre-primary-button {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-button-primary-fill, #0f1115);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  font-size: 14px;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
}
.bre-headers-edit .bre-primary-button:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #43454a);
}
.bre-headers-edit .bre-primary-button:disabled { opacity: 0.5; cursor: default; }
.bre-headers-edit .bre-secondary-button {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l3, #0000001f);
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 14px;
}
.bre-headers-edit .bre-secondary-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}

/* The row actions and the section's Edit affordance: the official 28px
   bordered small button, and the 21px blue text link the model rows use. */
.bre-headers-row .bre-link-button {
  height: 28px;
  padding: 2px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 12px;
  line-height: 1;
}
.bre-headers-row .bre-link-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
.bre-headers .bre-effort-head > .bre-link-button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2, #0000001a);
  border-radius: var(--dsw-radius-sm, 8px);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 12px;
  text-decoration: none;
}
.bre-headers .bre-effort-head > .bre-link-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
  text-decoration: none;
}
.bre-headers-edit .bre-link-button {
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 12px;
}

/* The section's own fields, on the official input box. */
.bre-headers-edit input.bre-text-input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l3, #0000001f);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 13px;
  box-sizing: border-box;
}
.bre-headers-edit input.bre-text-input:focus {
  border-color: var(--dsw-alias-label-tertiary, #81858c);
  outline: none;
}
.bre-headers-edit input.bre-text-input:disabled { opacity: 0.6; cursor: default; }

/* Status copy and the coexistence warnings, on the host's own state colours. */
.bre-headers .bre-effort-note.bre-warn { color: var(--dsw-alias-state-warn-label, #dd8629); }
.bre-headers .bre-effort-message.bre-success { color: var(--dsw-alias-state-success-primary, #22c55e); }
.bre-headers .bre-effort-message.bre-error { color: var(--dsw-alias-state-error-primary, #ec1313); }

@media (max-width: 520px) {
  .bre-headers-columns { display: none; }
  .bre-headers-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) 32px;
    gap: 6px;
    padding: 4px;
  }
  .bre-headers-edit input.bre-text-input {
    padding: 0 8px;
    font-size: 12px;
  }
}

/* ---- Provider row reordering (Models page) ---- */

/* The whole row header is the drag handle: an 18px grip is a poor thing to
   have to hit, so a drag may start anywhere on the header that is not one of
   the card's own controls (those keep their own cursor, declared below). */
li[data-bre-row-head='1'] { cursor: grab; }
li[data-bre-row-head='1']:active { cursor: grabbing; }
li[data-bre-row-head='1'] button,
li[data-bre-row-head='1'] a,
li[data-bre-row-head='1'] input { cursor: pointer; }

/* The grip is mounted as the first child of that header, so it reads as part
   of the row rather than as a control bolted beside it. It is also the button
   that reorders by keyboard. */
.bre-drag-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 14px;
  height: 20px;
  margin-right: 2px;
  border-radius: 4px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  cursor: grab;
  touch-action: none;
}

.bre-drag-grip:hover {
  color: var(--dsw-alias-label-secondary, #61666b);
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}

.bre-drag-grip:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.bre-drag-grip:active { cursor: grabbing; }

/* What the pointer carries: the browser's own drag image would be a screenshot
   of a whole card, so we hand it this chip with the provider name instead. */
.bre-drag-ghost {
  position: fixed;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  padding: 5px 10px 5px 7px;
  border: 1px solid var(--dsw-alias-border-secondary, #e6e8eb);
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 6px 18px #0000002e;
  color: var(--dsw-alias-label-primary, #17181a);
  font-size: 13px;
  line-height: 18px;
  pointer-events: none;
  transform: translate(-50%, -50%);
  z-index: 60;
}

.bre-drag-ghost-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bre-drag-ghost svg { color: var(--dsw-alias-label-tertiary, #81858c); }

/* The row the drag is carrying: still in place, visibly the one in hand. */
li.bre-row-dragging { opacity: .5; }

/* The row the pointer would drop it on — a secondary cue; the insertion line
   below is the one that says which side. */
li.bre-row-drop-target { border-color: var(--dsw-alias-brand-primary); }

/* The insertion line. A fixed overlay on the body, never a child of the list
   React owns, so writing it cannot trigger anything in the official section.
   The layer stack matters more than it looks: the provider list lives inside the
   settings dialog, whose overlay is fixed and opaque with z-index 1000, so a
   line in the shell's own range would be drawn behind the dialog and never
   seen. It clears the dialog, and stays under the header's controls. */
.bre-drop-line {
  position: fixed;
  display: none;
  height: 2px;
  border-radius: 2px;
  background: var(--dsw-alias-brand-primary, #4d6bfe);
  box-shadow: 0 0 0 1px #ffffffb3, 0 1px 4px var(--dsw-alias-brand-primary, #4d6bfe);
  pointer-events: none;
  z-index: 1200;
}

/* The row slide (a FLIP pass driven from the script) is motion; drop it for a
   reader who asked for less. */
@media (prefers-reduced-motion: reduce) {
  li[data-bre-row-provider] { transition: none !important; }
}

@media (max-width: 520px) {
  .bre-drag-grip { width: 18px; height: 24px; }
  .bre-drag-ghost { max-width: 180px; font-size: 12px; }
}

/* ---- Model rows inside one provider's editor (Models page) ---- */

/* The official model row is a four-column grid (id, display name, two icon
   buttons). Our grip is a fifth child, so the grid needs a leading track to
   hold it — declared by our own class, because the official rule is a single
   class selector and ours has to win on specificity, not on load order.
   The name must NOT be "bre-model-row": that one is this plugin's own composer
   row (see the ".bre-model-row" block above), and lending it to the host's grid
   would hand that grid our padding, gap, min-height, pointer cursor and hover
   fill along with it. */
.bre-model-grid[class*="modelRow"] {
  grid-template-columns: auto minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
}

/* A model row is a grid of inputs, so only the grip drags: the row keeps its
   text cursor and its own click behaviour. The grip takes the height of the
   row's controls, so the pointer has a real target inside a 6px-gap grid. */
.bre-model-grid > .bre-drag-grip {
  width: 18px;
  height: 24px;
  margin-right: 0;
}

/* The engine paints the carried row and the row under the pointer with the same
   classes it uses on a provider card; the official model entry carries the
   border, so the drop cue has to land there rather than on the list item. */
div.bre-row-dragging { opacity: .5; }
[class*="modelEntry"].bre-row-drop-target { border-color: var(--dsw-alias-brand-primary); }

/* The row slide (a FLIP pass driven from the script) is motion; drop it for a
   reader who asked for less. */
@media (prefers-reduced-motion: reduce) {
  [data-bre-row-model] { transition: none !important; }
}

/* ---- Provider enable switch (Models page) ---- */

/* Leads the row's own action group (which is pushed right by margin-left:auto),
   in front of the card's buttons, so the destructive one stays last. The knob is
   a pseudo element: no extra node for the official section's tree to trip over. */
.bre-provider-switch {
  position: relative;
  flex: 0 0 auto;
  width: 30px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: var(--dsw-alias-bg-tertiary, #d7dae0);
  cursor: pointer;
  transition: background 140ms ease;
}

.bre-provider-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 1px 2px #00000026;
  transition: transform 140ms ease;
}

.bre-provider-switch:not([aria-checked='true']):hover { background: var(--dsw-alias-bg-quaternary, #c9ccd2); }

.bre-provider-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary, #4d6bfe); }

.bre-provider-switch[aria-checked='true']:hover { background: var(--dsw-alias-brand-primary-hover, #3f5ce8); }

.bre-provider-switch[aria-checked='true']::after { transform: translateX(12px); }

.bre-provider-switch:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 2px;
}

/* A provider that is switched off stays on the page — this is the only place it
   can be switched back on — but it is visibly out of play. The switch itself is
   left at full strength: it is the way back. */
li.bre-row-disabled [class*="rowIdentity"],
li.bre-row-disabled [class*="rowName"] { opacity: .5; }

@media (prefers-reduced-motion: reduce) {
  .bre-provider-switch,
  .bre-provider-switch::after { transition: none; }
}

/* ---- The reserved delete seat (Models page) ---- */

/* A provider the host will not let the user remove renders no delete button, so
   that row's action group — pushed right by margin-left:auto — starts further
   right than its neighbours' and the column of buttons lines up raggedly. This
   seat holds the place: it borrows the metrics the official button takes inside
   an action group (.rowActions button is 28px tall / 12px / 0 10px) and the
   dimmed treatment the host gives its own disabled buttons (opacity .4 with a
   default cursor). It is always disabled — it is the alignment, not an action. */
.bre-provider-delete {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: 0 0;
  color: var(--dsw-alias-state-error-primary, #e5484d);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  opacity: .4;
  cursor: default;
}

/* -----------------------------------------------------------------------
   The provider editor's three tabs.

   The official editor lays a provider out as one long column — identity
   fields, then the model list, then this plugin's request-header section
   one slot up the card. The tab pass (injection/editor-tabs.ts) tags each
   region and stamps the card with the active tab; EVERY visibility decision
   lives here, so the official React tree never moves and a pass failure
   degrades to the untouched one-column editor.
   ----------------------------------------------------------------------- */

/* The segmented control. The plugin's tab-bar component renders it inside the
   request-header mount, which already holds the card's 12px gap slot — so the
   bar reaches the panes in the card's own rhythm WITHOUT this plugin ever
   inserting a node into the official child list. It stays hidden until the pass
   marks the card: a card the pass could not take over (the DeepSeek account
   editor) keeps that mount visible for its request-header section, and must not
   grow a bar that switches nothing. */
.bre-editor-tabs {
  display: none;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09));
}

/* Only a taken-over card shows the bar. */
.bre-tabbed .bre-editor-tabs { display: flex; }

/* ...and while the takeover is on, the mount holding that bar MUST be visible.
   This is the one place the takeover does not delegate its reveal to the
   official-edit state: the bar lives in here, and gating it on the _editor
   class probe would make the tabs depend on a probe an official redesign can
   break — with data-edit stuck at 0 the bar would be inside a display:none
   parent and no rule of ours could reach it. The taken-over class is written by
   the pass itself, in the same frame, so it is the trustworthy half of the
   pair. The section's own visibility stays a pane decision (below). */
.bre-tabbed .bre-headers-host { display: block; }

.bre-editor-tab {
  flex: 1 1 0;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #61666b);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.bre-editor-tab:hover { color: var(--dsw-alias-label-primary, #0f1115); }

/* The selected segment lifts out of the track: the page's own surface colour
   plus the card's own hairline, the same elevation the host uses for raised
   controls. Hover on a selected tab stays put — it is already where you are. */
.bre-editor-tab[aria-selected='true'],
.bre-editor-tab[aria-selected='true']:hover {
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  box-shadow: 0 1px 2px #0000001a, 0 0 0 1px var(--dsw-alias-border-l2, #0000001a);
}

.bre-editor-tab:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 1px;
}

/* An advanced section with no headers mount (pre-first-render, feature off)
   offers an empty pane — the button steps aside until the mount exists. */
.bre-editor-tab[hidden] { display: none; }

/* Pane visibility, keyed on the card's active tab. Only the HIDING has to win
   a specificity fight (against the official sheet and the headers host's own
   reveal rule); the active pane keeps whatever display the official layout
   gave it, so showing must not declare a display at all. */
.bre-tabbed:not([data-bre-tab='provider']) [data-bre-region='provider'],
.bre-tabbed:not([data-bre-tab='models']) [data-bre-region='models'],
.bre-tabbed:not([data-bre-tab='advanced']) [data-bre-region='advanced'] {
  display: none !important;
}

/* The advanced tab: the official body — fields, model list, action row and the
   editor's own header — steps aside for the request-header section, which is a
   complete form with its own save/cancel and becomes the pane under the very
   same bar. */
.bre-tabbed[data-bre-tab='advanced'] [data-bre-editor-body] {
  display: none !important;
}

/* The advanced pane shows the section for the same reason the mount is shown:
   a pane that is already the active one has no business depending on the
   official-edit probe. The rule above still wins for every other tab, and the
   base bre-headers rule keeps a collapsed card's section hidden — a card only
   carries the taken-over class while its editor is open. */
.bre-tabbed[data-bre-tab='advanced'] .bre-headers { display: flex; }

/* The pane is a card, and the section draws it. On the advanced tab the section
   is not an appendage to the fields above it any more — it is the whole surface
   — so it takes the inset fill the official module cards use (the add and setup
   cards): the one fill in this system that stays visible on the content card's
   own white in the light theme and reads as raised in the dark one, where every
   theme layer token collapses onto the same value. The hairline goes with it: it
   divided this section from those fields, and here the bar above ends the pane.
   The 12px top margin sets the card off the tab bar above it — the same gap the
   provider and models panes put between the bar and their own cards — and the
   12px padding is the card's inner inset, not the separator. */
.bre-tabbed[data-bre-tab='advanced'] .bre-headers {
  margin-top: 12px;
  padding: 12px;
  border-top: none;
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
}

/* The live editor folds its identity fields and model list into one
   "Customized" disclosure. Under the tabs the grouping is the panes' job: the
   group stays expanded (the pass forces it open) and its summary row — now a
   toggle with nothing left to toggle — steps aside. */
.bre-tabbed [data-bre-editor-body] details > summary {
  display: none !important;
}

/* A region that is NOT a pane. The editor's own header repeats the card row's
   provider name and route tag, and that row is already on screen directly above
   it, so the header is hidden on every tab. No pane rule above can select this
   id, which is what keeps it hidden whichever tab is active. */
.bre-tabbed [data-bre-region='none'] {
  display: none !important;
}

/* The Models pane shows the custom model list and the catalogue, and two
   hairlines used to divide it: the "Customized" group's separator from the key
   field (which this pane hides) and the catalogue's own, drawn directly above
   its "Model catalogue" heading. Neither has anything to divide here — the tab
   bar already ends the pane above, and the divider between the two lists above
   the catalogue is the group's boundary, not a rule. Both go, with every top
   padding that held content off them (the group's 10px, its body's 12px, the
   catalogue's 12px), so the pane runs from the tab bar into the catalogue with
   only the official editor's own 14px gap between blocks. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] details[class*='customized'] {
  border-top: none;
  padding-top: 0;
}

.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] details[class*='customized'] > [class*='customizedBody'] {
  padding-top: 0;
}

/* The catalogue is a section (its heading, title and meta are the divs inside
   it), so this probe hits the ruled box and nothing else. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] section[class*='modelCatalog'] {
  border-top: none;
  padding-top: 0;
}

/* The catalogue heading names a box this pane has already named for the user:
   the Models tab IS the catalogue, so "模型目录" says it twice, and
   "已自定义模型目录" (the meta line beside it) says nothing at all — the rows
   below ARE the customized catalogue. Both strings are the host's own, so they
   go by class stem, and the heading takes its title and meta with it. The
   head's own controls (恢复默认模型 / 获取可用模型) are siblings of the heading,
   not children, so they stay — the auto-adapt seat is anchored to them. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelCatalogHeading'] {
  display: none;
}

/* With the heading gone the head holds only controls, and they read as TWO
   ENDS: 恢复默认模型 stays at the left edge while 获取可用模型 keeps the
   auto-adapt seat beside it at the far right — the seat belongs to that link's
   group, it is never a column of its own. The official space-between cannot
   express that once a third child exists: it spreads the three evenly, which
   strands the fetch link in the middle of the card. So the free space is handed
   to the fetch link's own leading auto margin instead — an auto margin absorbs
   the space BEFORE justify-content is consulted, whatever the official rule
   says. The fetch link is the button the seat sits after, which is also the
   only control present when the provider is not overridden: the pair then
   simply holds the right edge. align-items centres the taller host links
   against the seat. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelListHead'] {
  align-items: center;
}
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelListHead'] > button:has(+ .bre-auto-effort) {
  margin-left: auto;
}

/* The click's answer, as a bubble at the top of the window that takes itself
   away again. The control is left alone on purpose: its label is what the user
   aimed at, and a button that rewrites itself is a button that moved. The
   bubble is a fixed overlay on the body — not a child of the head, which is the
   host's flex row and would take a fourth item — and it clears the settings
   dialog's opaque overlay for the same reason the drop line does. It follows
   the host's own toast in placement and tone, but not in z-index: the settings
   dialog's overlay outranks the toast layer, and this bubble is raised from
   inside that dialog. Pointer-events none keeps it out of the way, the phase
   colours the headline so the outcome reads before the words do, and the
   hold/fade pair is timed by --bre-note-hold, which the script sets from the
   same constant it uses for the dismissal. The fade is counted INSIDE that
   hold, so the bubble is gone when the clock says it is, rather than fading
   after it. */
.bre-auto-effort-note {
  position: fixed;
  top: 40px;
  left: 50%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: max-content;
  max-width: min(640px, calc(100vw - 48px));
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--dsw-alias-toast-bg, #2b2f36);
  color: var(--dsw-alias-toast-label, #f9fafb);
  box-shadow: var(--dsw-shadow-lv3, 0 6px 24px #00000029);
  font-size: 13px;
  line-height: 20px;
  pointer-events: none;
  transform: translateX(-50%);
  animation: bre-note-in 160ms ease-out, bre-note-out 400ms ease calc(var(--bre-note-hold, 3000ms) - 400ms) forwards;
  z-index: 1200;
}
/* A pass in flight has no lifetime of its own: it is replaced by its verdict,
   which restarts both animations because the phase changes the rule. */
.bre-auto-effort-note[data-bre-auto-effort-phase='working'] {
  animation: bre-note-in 160ms ease-out;
}
@keyframes bre-note-in {
  from { opacity: 0; transform: translate(-50%, -6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes bre-note-out {
  to { opacity: 0; visibility: hidden; }
}
@media (prefers-reduced-motion: reduce) {
  .bre-auto-effort-note {
    animation: bre-note-out 400ms ease calc(var(--bre-note-hold, 3000ms) - 400ms) forwards;
  }
  .bre-auto-effort-note[data-bre-auto-effort-phase='working'] { animation: none; }
}
.bre-auto-effort-note-text { font-weight: 500; }
.bre-auto-effort-note-detail { opacity: .72; }
/* The attribute is the visibility switch, so it must beat the flex column above. */
.bre-auto-effort-note-detail[hidden] { display: none; }
.bre-auto-effort-note[data-bre-auto-effort-phase='working'] .bre-auto-effort-note-text {
  color: var(--dsw-alias-state-business-primary, #6ea8fe);
}
.bre-auto-effort-note[data-bre-auto-effort-phase='done'] .bre-auto-effort-note-text {
  color: var(--dsw-alias-state-success-primary, #22c55e);
}
.bre-auto-effort-note[data-bre-auto-effort-phase='failed'] .bre-auto-effort-note-text {
  color: var(--dsw-alias-state-error-secondary, #ff8a80);
}

/* The API-key eye. The official key field is a plain flex column whose input is
   its last in-flow child, so the button hangs on the field's own box and is
   measured against the input's 32px row — the official markup offers no
   wrapper, and introducing one would mean moving DOM the host owns. The input
   keeps the room the button needs. */
.bre-key-field { position: relative; }

.bre-key-field > input { padding-right: 34px; }

/* A field the plugin's key list manages hands its input over: the list below
   says the same thing once per key and keeps the pick, the alias and the value
   in one place, so an official box that writes the provider's single key would
   be a second, conflicting way to do it. The input stays in the DOM — the
   host's form still owns it and the reveal pass still finds it — so unmanaging
   the field brings the official box back. The marker is what the reveal pass
   stamps on that input; the direct-child form covers the pass that has not run
   yet, and the eye is the button the same pass hangs on the field. */
.bre-key-managed [data-bre-key-input],
.bre-key-managed > input,
.bre-key-managed .bre-key-eye { display: none; }

/* A field that failed validation grows a message line under the input; the eye
   rides above it so it stays on the input it belongs to (18px line + 6px gap). */
.bre-key-field:has(> p) .bre-key-eye { bottom: 24px; }

.bre-key-eye {
  position: absolute;
  right: 4px;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  transition: background 140ms ease, color 140ms ease;
}

.bre-key-eye:hover {
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-interactive-bg-hover);
}

.bre-key-eye:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3);
}

/* Resolving a stored key is a same-origin round trip, so the button can be
   busy: it stays in place and dims rather than changing size or disappearing. */
.bre-key-eye[aria-busy='true'] {
  opacity: 0.55;
  cursor: progress;
}

.bre-key-eye[hidden] { display: none; }

/* One glyph at a time. The state lives on the button's own attribute, so a
   click swaps the icon without the host re-rendering anything. */
.bre-key-eye svg[data-bre-icon] { display: none; }

.bre-key-eye[aria-pressed='false'] svg[data-bre-icon='eye'],
.bre-key-eye[aria-pressed='true'] svg[data-bre-icon='eye-off'] { display: block; }

/* The key list. The plugin mounts it into its own host, a sibling placed right
   after the official key field, so the list sits under the input without
   changing the field's own box: the reveal eye is measured against that box
   (bottom: 0), and a list inside the field would drag the eye down onto the
   list's last row. The margin only covers the case where the card spaces its
   fields with margins instead of a gap. */
.bre-keys-host {
  display: block;
  min-width: 0;
  margin-top: 4px;
}

.bre-keys { display: flex; flex-direction: column; gap: 8px; }

/* While the key list is still reading, the panel renders NOTHING (the component
   returns an empty .bre-keys). An empty ruled box — or a placeholder line that
   then swaps to the list — would paint one frame of a panel that then visibly
   changes: the "the key section flashes when you press Edit" report. :empty
   takes the panel out of the layout until the first answer lands, so the list
   is the first thing the key area ever paints, and nothing under it moves. */
.bre-keys:empty { display: none; }

/* One ruled container holding the keys and the add entry, the way a settings
   list reads: a single hairline box, and hairlines between rows only. */
.bre-keys-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d7dd);
  border-radius: 8px;
  list-style: none;
  overflow: hidden;
}

.bre-keys-list > li + li { border-top: 0.5px solid var(--dsw-alias-border-l2, #d5d7dd); }

.bre-keys-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
}

/* The enable choice closes the row. The radio stays the real input — so the
   keys of one provider are one group, choosing one clears the rest, and the
   pick is keyboard-reachable — and the circle is its face; the word beside it
   names the action instead of a state to hunt for. */
.bre-keys-enable {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.bre-keys-enable-text {
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, #6b7280);
}

.bre-keys-enable:has(.bre-keys-enabled:checked) .bre-keys-enable-text {
  color: var(--dsw-alias-label-primary, #0f1115);
}

.bre-keys-enabled {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  white-space: nowrap;
  clip-path: inset(50%);
}

.bre-keys-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l3, #9aa0aa);
  border-radius: 50%;
  color: var(--dsw-alias-bg-layer-1, #ffffff);
  transition: background 120ms ease, border-color 120ms ease;
}

.bre-keys-mark > svg { width: 12px; height: 12px; }

.bre-keys-enabled:checked + .bre-keys-mark {
  border-color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-label-primary, #0f1115);
}

.bre-keys-enabled:focus-visible + .bre-keys-mark {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

/* With an alias the alias is the row's name and the masked key follows it as a
   quiet code pill; without one the masked key is the name and takes the row's
   measure, so a key is always readable as itself. */
.bre-keys-alias {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #0f1115);
}

.bre-keys-mask {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.08));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.bre-keys-mask-plain {
  flex: 1 1 auto;
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-family: inherit;
  font-size: 12px;
}

/* The row's three actions, revealed on hover or keyboard focus rather than
   removed, so the row keeps its width and nothing shifts under the pointer.
   Revealing is opacity alone; a pointer that cannot hover simply always sees
   them, because a hidden action there would be an unreachable one. */
.bre-keys-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.bre-keys-row:hover .bre-keys-actions,
.bre-keys-row:focus-within .bre-keys-actions {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: none) {
  .bre-keys-actions { opacity: 1; pointer-events: auto; }
}

.bre-keys-danger { color: var(--dsw-alias-state-error-primary, #c62828); }

/* The one inline form. It opens under the row it edits, or — for a new key — as
   the list's own last item, which is what keeps adding a key in place instead
   of in a dialog that has to be found and dismissed. */
.bre-keys-form-row { padding: 10px; }

.bre-keys-form { display: flex; flex-direction: column; gap: 8px; }

.bre-keys-form-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

/* One field means the whole row: the value form holds only the secret, and it
   must not sit in half a row beside an empty half. */
.bre-keys-form-fields > :only-child { grid-column: 1 / -1; }

/* The shared input caps itself at 240px for the panels it was written for; here
   the field is the measure. */
.bre-keys-form-fields .bre-text-input { max-width: none; }

.bre-keys-form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

/* The shared primary button is styled inside the headers editor, which is not
   where this form lives, so the key list carries its own compact copy. */
.bre-keys-form-actions .bre-primary-button {
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-button-primary-fill, #0f1115);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.bre-keys-form-actions .bre-primary-button:hover {
  background: var(--dsw-alias-button-primary-hover, #43454a);
}

.bre-keys-form-actions .bre-primary-button:disabled { opacity: 0.5; cursor: default; }

.bre-keys-form-actions .bre-primary-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

/* The add entry is the list's own last row — full width, the same shape as the
   keys it adds to — so the way in and the thing it makes read as one list. */
.bre-keys-add-row { padding: 0; }

.bre-keys-add {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  transition: background 120ms ease, color 120ms ease;
}

.bre-keys-add:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.08));
  color: var(--dsw-alias-label-primary, #0f1115);
}

.bre-keys-add:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

.bre-keys-add:disabled { opacity: 0.55; cursor: default; }

.bre-keys-add-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.bre-keys .bre-effort-message { font-size: 11px; }

@media (prefers-reduced-motion: reduce) {
  .bre-editor-tab { transition: none; }
  .bre-key-eye { transition: none; }
  .bre-keys-mark, .bre-keys-actions, .bre-keys-add { transition: none; }
}
`
