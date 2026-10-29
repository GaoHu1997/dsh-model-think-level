/**
 * Stylesheet for the injected editor. Deliberately tiny
 * and self-contained: it is injected into the settings panel and must not
 * collide with the official Models page classes, so every selector is prefixed
 * `bre-`. Uses CSS variables for theme awareness where the host provides them.
 */

/** The stylesheet text, inserted once into <head> by the client apply(). */
export const STYLES = `
/* ---- Quiet Precision: the plugin's own token layer ----
   Every value below is a HOST design-platform token (--dsw-*) with the light
   theme's literal as the fallback, so the plugin inherits a theme switch for
   free instead of carrying a second palette. The few values the platform has no
   name for (a 10% accent tint, the slider's track grey) are declared here once
   and re-declared under the host's dark attribute — the plugin never hard-codes
   a colour in a component rule.

   The layer is declared on BOTH :root and body on purpose. A custom property
   resolves var() where it is DECLARED, not where it is used: declared on :root
   alone, --bre-ink would read the alias chain as the <html> element sees it, and
   the host republishes its dark aliases on body[data-ds-dark-theme] — a
   descendant — so every value here would stay frozen at the light fallback.
   Declaring it again on body makes each var() resolve against the element that
   actually carries the theme. */
:root,
body {
  --bre-ink: var(--dsw-alias-label-primary, #0f1115);
  --bre-ink-2: var(--dsw-alias-label-secondary, #61666b);
  --bre-ink-3: var(--dsw-alias-label-tertiary, #81858c);
  /* label-dimmed is the host's disabled/skeleton tone — bluish-200 #e1e5ee on
     white, bluish-750 #43454a on #292929. Invisible as body copy, and it was what
     every placeholder and muted value inherited. Dimmed now stops at tertiary, and
     hint copy gets its own token a step darker so descriptions read without
     competing with real values. */
  --bre-ink-4: var(--dsw-alias-label-tertiary, #81858c);
  --bre-ink-hint: var(--dsw-alias-label-secondary, #61666b);
  --bre-surface: var(--dsw-alias-bg-base, #ffffff);
  --bre-sunken: var(--dsw-alias-bg-module-platform, #f5f6f7);
  --bre-sunken-2: var(--dsw-alias-fill-tertiary, #f1f3f5);
  --bre-track: #e9ecf2;
  --bre-hover: var(--dsw-alias-interactive-bg-hover, #2631480f);
  --bre-active: var(--dsw-alias-interactive-bg-active, #2631481a);
  --bre-line-1: var(--dsw-alias-border-l1, #0000000a);
  --bre-line-2: var(--dsw-alias-border-l2, #0000001a);
  --bre-line-3: var(--dsw-alias-border-l3, #0000001f);
  --bre-line-4: var(--dsw-alias-border-l4, #00000029);
  --bre-accent: var(--dsw-alias-link, #4176e6);
  --bre-accent-ink: #2f4c8f;
  --bre-accent-weak: #edf3fe;
  --bre-accent-line: #4176e640;
  --bre-accent-glow: #4176e61f;
  --bre-ok: var(--dsw-alias-state-success-primary, #22c55e);
  /* The success family gets the same three steps the accent family has (ink /
     weak fill), because 「计入」 is a state a pill must paint, not a 1px dot.
     The ink step stays a literal: the host's success token is a FILL colour and
     unreadable as 11px text on its own tint. */
  --bre-ok-ink: #157a43;
  --bre-ok-weak: #eefaf2;
  --bre-warn: var(--dsw-alias-state-warn-label, #dd8629);
  --bre-warn-weak: #fdf6ec;
  --bre-danger: var(--dsw-alias-state-error-primary, #ec1313);
  --bre-danger-weak: #fef2f2;
  --bre-r-xs: 4px;
  --bre-r-sm: 8px;
  --bre-r-md: 12px;
  --bre-r-pill: 999px;
  --bre-switch-track: #cfd3d6;
  --bre-switch-knob: #ffffff;
  --bre-ease: cubic-bezier(.4, 0, .2, 1);
  --bre-t: .16s;
  --bre-shadow-pop: 0 2px 5px #00000009, 0 12px 32px -8px #0f11151f;
}
body[data-ds-dark-theme] {
  --bre-ink-4: var(--dsw-alias-label-tertiary, #adb2b8);
  --bre-surface: #292929;
  --bre-sunken: #353638;
  --bre-sunken-2: #3d3e40;
  --bre-track: #434446;
  --bre-accent-ink: #d3e2ff;
  --bre-accent-weak: #1e335c;
  --bre-accent-line: #7aaaff40;
  --bre-accent-glow: #7aaaff26;
  /* Success/warn tints have to be repainted, not inherited: a 10% mint wash on
     a #353638 card is invisible, and #157a43 as 11px text on a dark card is
     unreadable. Dark therefore swaps roles — deep fill, light ink — which is
     exactly how the accent family above behaves. */
  --bre-ok-ink: #6ad391;
  --bre-ok-weak: #17301f;
  --bre-warn-weak: #35281a;
  --bre-danger-weak: #3a1b18;
  --bre-switch-track: #4a4b4d;
  --bre-shadow-pop: 0 2px 5px #00000059, 0 12px 32px -8px #000000a6;
}

/* The injector's mount wrapper. It — not the editor inside it — is the item
   placed into the official row disclosure's repeat(auto-fit, minmax(160px,1fr))
   grid (context window and max tokens take two cells), so the span belongs
   here: on the editor itself it would target the wrapper's block box and be
   ignored, squeezing the block into one cell. The min-width floors the grid
   item's auto minimum at 0 for the same reason: a one-line hint inside must
   clip at the disclosure's edge, not price the host grid wider than it is. */
.bre-effort-slot {
  grid-column: 1 / -1;
  min-width: 0;
}
/* The slot wrapper is a plain column: the master thinking switch sits in it,
   directly above the card it gates. */
.bre-effort-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 4px;
}
/* The 思考强度 panel proper — rendered only while the master switch is on.
   User item 8: the 0.5px outline goes away — 框里画框, a frame drawn inside a
   frame, was the complaint. User item 3 then dropped the tinted fill too: the
   editor sits INSIDE the official card, so a grey slab read as a second card
   nested in the first. The panel now paints the same fill as the host's own
   row cards and takes its structure from spacing alone. */
.bre-effort-card {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 12px 15px 12px;
  border: none;
  border-radius: var(--bre-r-md);
  background: var(--dsw-alias-settings-card-fill, #ffffff);
  box-sizing: border-box;
}
/* 支持模态, above the thinking switch. The same 15px inset as the card below
   so its label lines up with the card's sections and with the switch. */
.bre-effort-modality {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 0 15px;
}
/* The editor's one-line head: the master switch with its title, the declared
   state, and the applied suggestion's provenance pill. The card below pads
   its content 15px in; without the same inset the switch sits on the card's
   outer edge, left of every section under it. */
.bre-effort-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  padding: 0 15px;
}
/* A caveat that qualifies the SWITCH (no reasoning-effort control declared, no
   off level): it hangs directly under the switch row, so it keeps that row's
   15px inset and tightens the gap instead of opening a paragraph block. */
.bre-effort-note--top {
  padding: 0 15px;
  margin-top: -3px;
}
.bre-effort-state {
  font-size: 12px;
  color: var(--bre-ink-3);
}
.bre-effort-title {
  /* The section title reads as the panel's own heading: primary ink at the
     design's 13/500, not a grey caption — it names the row, the hints under
     it carry the explanation. The headers pane borrows the same face. */
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--bre-ink);
}
/* The master switch, at the board's small size: a 28x16 track with a 12px knob.
   The native checkbox stays — it is the accessible control, it keeps the row
   keyboard-operable, and it is what the tests click — but it is transparent and
   stretched over the track it drives. */
.bre-thinking-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  margin: 0;
  cursor: pointer;
}
.bre-thinking-switch input[type='checkbox'] {
  position: absolute;
  left: 0;
  top: 50%;
  z-index: 1;
  width: 28px;
  height: 16px;
  margin: -8px 0 0;
  padding: 0;
  opacity: 0;
  cursor: pointer;
}
.bre-effort-switch-track {
  position: relative;
  flex: none;
  width: 28px;
  height: 16px;
  border-radius: var(--bre-r-pill);
  background: var(--bre-switch-track);
  transition: background var(--bre-t) var(--bre-ease);
}
.bre-effort-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--bre-switch-knob);
  box-shadow: 0 1px 2px #0f111533;
  transition: transform var(--bre-t) var(--bre-ease);
}
.bre-thinking-switch input:checked + .bre-effort-switch-track {
  background: var(--dsw-alias-brand-primary, #4d6bfe);
}
.bre-thinking-switch input:checked + .bre-effort-switch-track::after {
  transform: translateX(12px);
}
.bre-thinking-switch input:focus-visible + .bre-effort-switch-track {
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
.bre-thinking-switch input:disabled + .bre-effort-switch-track {
  opacity: 0.4;
  cursor: default;
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
/* The level ladder is a row of toggle pills: the armed ones carry the accent
   tint alone (选中的档位高亮即可，无需对勾), the rest stay quiet outlines. One
   click is one declaration. The pills are TIGHT — seven levels must sit on one
   line in the row disclosure (a wrapped ladder with an orphaned last pill reads
   as two ladders); the wire spellings live folded behind the link beneath. */
.bre-pillrow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* The level ladder and the modality pair share one pill face: 28px, an
  8px corner and a hairline stroke, so a row of them reads as one control. The
  armed pill is the DESIGN's selection — accent tint, accent edge, accent ink,
  and NO tick (选中的档位高亮即可，无需对勾: a second glyph would also shift the
  row's width every time a level is clicked). */
.bre-lvl {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--bre-r-sm);
  border: 1px solid var(--bre-line-3);
  background: var(--bre-surface);
  color: var(--bre-ink-2);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--bre-t) var(--bre-ease);
}
.bre-lvl:hover:not(:disabled) {
  border-color: var(--bre-line-4);
  color: var(--bre-ink);
}
.bre-lvl:focus-visible {
  outline: none;
  border-color: var(--bre-accent);
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
.bre-lvl:disabled { opacity: 0.55; cursor: default; }
.bre-lvl.is-on {
  border-color: var(--bre-accent-line);
  background: var(--bre-accent-weak);
  color: var(--bre-accent-ink);
  font-weight: 500;
}
/* A level the stored ladder names but this draft leaves unarmed: still
   clickable, simply standing back (the board's is-dim state). */
.bre-lvl.is-dim { opacity: 0.45; }
/* The modality pair: the glyph is the identity, so it takes the wider padding
   and carries its own ink — quiet when the declaration does not include it, the
   accent when it does. */
.bre-lvl--opt { gap: 6px; padding: 0 11px; }
.bre-lvl--opt svg { flex: none; color: var(--bre-ink-3); }
.bre-lvl--opt.is-on svg { color: var(--bre-accent); }
/* The slider's head, written above the track (进度条上方：思考等级 + 当前等级):
   the section name on the left, the level under the thumb on the right. One
   accent, so the value reads as "this is the current setting", not as a rank. */
.bre-effort-slider-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.bre-effort-slider-head-label {
  font-size: 11.5px;
  line-height: 18px;
  color: var(--bre-ink-3);
}
.bre-effort-slider-head-value {
  font-size: 12.5px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: -.005em;
  color: var(--bre-accent-ink);
}
/* The level slider: the composer menu's reasoning-level footer. A long ladder
   wrapped its capsule row inside the popover (思考等级选择换成进度条样式); a
   track is fixed-length whatever the ladder's size, the stop names written
   below it.

   The rainbow ramp is GONE: a red stop read as "danger" where the interface
   meant "more", and the seven-hue scale was the one place the plugin spoke a
   colour language the host never uses. What is left is the host's own accent
   for "where the thumb is" and tick marks for "how many stops there are". */
.bre-effort-slider {
  position: relative;
  height: 18px;
  cursor: pointer;
  touch-action: none;
}
.bre-effort-slider::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--bre-track);
}
.bre-effort-slider:focus-visible {
  outline: none;
  border-radius: 999px;
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
.bre-effort-slider-fill {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--bre-accent);
  pointer-events: none;
}
/* The remaining stops, sunk into the track as 2px holes. Painted white on the
   light theme and near-black on the dark one: they are holes, not dots, so they
   take the surface colour rather than an ink colour. */
.bre-effort-slider-tick {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 2px;
  margin-left: -1px;
  margin-top: -1px;
  border-radius: 50%;
  background: var(--bre-surface);
  opacity: .9;
  pointer-events: none;
}
.bre-effort-slider-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  background: var(--bre-surface);
  box-shadow: 0 0 0 1px var(--bre-accent-line), 0 1px 3px #0f11152e;
  pointer-events: none;
  /* User item 4: a committed level used to teleport the thumb. The two settling
     nodes glide instead — and the glide is switched off the moment the pointer
     takes the track, or the drag itself would lag one frame behind the finger. */
  transition: left var(--bre-t) var(--bre-ease);
}
.bre-effort-slider-fill {
  transition: clip-path var(--bre-t) var(--bre-ease);
}
.bre-effort-slider[data-bre-dragging='true'] .bre-effort-slider-thumb,
.bre-effort-slider[data-bre-dragging='true'] .bre-effort-slider-fill {
  transition: none;
}
/* The stops, written under the track: first left-aligned, last right-aligned,
   the middle ones centred on their stop, so the row never wraps. */
.bre-effort-slider-labels {
  position: relative;
  height: 14px;
  margin: 5px 2px 0;
}
.bre-effort-slider-label {
  position: absolute;
  transform: translateX(-50%);
  font-size: 9.5px;
  line-height: 14px;
  letter-spacing: -.02em;
  color: var(--bre-ink-hint);
  white-space: nowrap;
}
.bre-effort-slider-label.is-first { transform: none; }
.bre-effort-slider-label.is-last { transform: translateX(-100%); }
.bre-effort-slider-label.is-on {
  color: var(--bre-accent-ink);
  font-weight: 600;
}
/* A section of the panel: the label row, the hint that explains it, and the
   control group. The board spaces the three at 9px, and gives the label row a
   22px floor so a section with a trailing action still lines up with one that
   has none. */
.bre-effort-sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bre-effort-labelrow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}
.bre-effort-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--bre-ink-2);
}
/* User item 8: the explanation moved OUT of the label row. As an ellipsised
   fragment beside the label it was unreadable at the disclosure's width; on its
   own line at 11/16 the whole sentence fits, which is what the board draws.
   It now follows the pills (the board's order: heading, control, note), so it
   keeps no top margin of its own — the section's 6px gap is the whole spacing. */
.bre-effort-hint {
  font-size: 11px;
  line-height: 16px;
  margin: 0;
  color: var(--bre-ink-4);
}
.bre-effort-grow { flex: 1 1 auto; min-width: 0; }
/* The label row's trailing action (自动适配): the board's quiet button — 26px,
   a hairline, quiet ink — not a link. */
.bre-effort-adapt {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  margin-left: auto;
  border: 1px solid var(--bre-line-2);
  border-radius: var(--bre-r-sm);
  background: var(--bre-surface);
  color: var(--bre-ink-2);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: background var(--bre-t) var(--bre-ease), border-color var(--bre-t) var(--bre-ease), color var(--bre-t) var(--bre-ease);
}
.bre-effort-adapt:hover:not(:disabled) {
  border-color: var(--bre-line-4);
  color: var(--bre-ink);
}
.bre-effort-adapt:disabled { opacity: 0.5; cursor: default; }
.bre-effort-adapt svg { flex: none; color: var(--bre-accent); }
/* The quiet link that unfolds the armed levels' wire spellings: 22px tall at
   11.5px, hanging at the left edge of the group it opens. */
.bre-effort-wiretoggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  margin: 0;
  padding: 0 2px;
  border: none;
  background: none;
  font: inherit;
  font-size: 11.5px;
  color: var(--bre-ink-3);
  cursor: pointer;
}
.bre-effort-wiretoggle:hover:not(:disabled) { color: var(--bre-ink); }
.bre-effort-wiretoggle:disabled { opacity: 0.5; cursor: default; }
.bre-effort-wiretoggle svg { flex: none; }
/* The wire spellings: the board's own block — a white sheet on the sunken panel,
   one 92px name column and one value column per armed level, the value set in
   the code face so a spelling's punctuation is legible. */
.bre-wire {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--bre-line-1);
  border-radius: var(--bre-r-sm);
  background: var(--bre-surface);
}
.bre-wire-grid {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 6px 10px;
  align-items: center;
}
.bre-wire-name {
  font-size: 11px;
  letter-spacing: 0.01em;
  color: var(--bre-ink-4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The sections below the ladder sit in two columns on a wide disclosure and
   stack on a narrow one: the board's 1fr 1fr, floored so a squeezed column
   never wraps a note into three lines. */
.bre-effort-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 18px;
  align-items: start;
}
/* The card with the thinking switch off: the two token counts stand alone, so
   the slab tightens to their own height and keeps the same 15px inset. */
.bre-effort-card--capacity {
  gap: 9px;
  padding: 11px 15px 12px;
}
.bre-effort-wire {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--bre-line-2);
  border-radius: 6px;
  background: var(--bre-surface);
  color: var(--bre-ink-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
}
.bre-effort-wire::placeholder { color: var(--bre-ink-4); }
.bre-effort-wire:focus {
  outline: none;
  border-color: var(--bre-accent);
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
/* A hairline between the panel's groups (the board's eff-sep). */
.bre-effort-sep {
  height: 1px;
  margin: 0;
  border: none;
  background: var(--bre-line-1);
}
.bre-effort-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
/* The panel's only action is 放弃修改, and the board draws it as a ghost — no
   border, no fill, quiet ink — so the row does not end on a second button-shaped
   promise beside the card's own 保存. */
.bre-effort-actions .bre-secondary-button {
  height: 28px;
  padding: 0 10px;
  border-color: transparent;
  background: transparent;
  color: var(--bre-ink-2);
  font-size: 12px;
}
.bre-effort-actions .bre-secondary-button:hover:not(:disabled) {
  background: var(--bre-hover);
  color: var(--bre-ink);
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
/* The note under a control: the board's third level of explanation — 11/16 in
   the faintest ink, an optional 12px glyph hanging in the left margin. Kept as
   flowing text (not a flex row) because the headers pane writes whole sentences
   through this same class and a flex container would make every text run its own
   unwrappable item. */
.bre-effort-note {
  font-size: 11px;
  line-height: 16px;
  margin: 0;
  color: var(--bre-ink-4);
}
.bre-effort-note svg {
  display: inline-block;
  vertical-align: -2px;
  margin-right: 6px;
  flex: none;
  color: var(--bre-ink-4);
}
/* The default-effort dropdown, drawn as the board's mini-select: a 30px white
   box with a hairline and the same 12px chevron the other selects use, so it
   reads as one of the panel's controls rather than a form field dropped in.
   It stays a REAL select (aria-label included) because that is what the row
   stores a level into. */
.bre-effort-select {
  flex: none;
  width: 100%;
  max-width: 260px;
  height: 30px;
  min-width: 0;
  padding: 0 30px 0 9px;
  border: 1px solid var(--bre-line-3);
  border-radius: var(--bre-r-sm);
  background-color: var(--bre-surface);
  color: var(--bre-ink);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
  background-size: 12px 12px;
  transition: border-color var(--bre-t) var(--bre-ease), box-shadow var(--bre-t) var(--bre-ease);
}
.bre-effort-select:hover:not(:disabled) { border-color: var(--bre-line-4); }
.bre-effort-select:focus-visible {
  outline: none;
  border-color: var(--bre-accent);
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
.bre-effort-select:disabled { opacity: 0.55; cursor: default; }
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
/* Dimmed directly would be the host's skeleton tone (#e1e5ee) — the same trap the
   ink tokens now route around; placeholders read at tertiary like every other one. */
.bre-text-input::placeholder { color: var(--bre-ink-4); }
.bre-select:focus, .bre-text-input:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
  /* The redesign's focus token: brand border over a soft brand halo, so the
     focused field reads at a glance without a hard outline. */
  box-shadow: 0 0 0 3px var(--dsw-alias-brand-primary-muted, rgba(77, 112, 255, .14));
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
/* The two capacities are EDITABLE fields, not a footnote (user request: 上下文
  参数/最大长度这两个参数需要可以配置): each is the row's own official input,
  mirrored here, so the label sits above a sunken field with the unit inside it.
  Blank is a value — 沿用目录值 — which is why the placeholder says so. */
.bre-effort-caps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 18px;
}
.bre-cap {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}
.bre-cap-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 9px;
  border-radius: var(--bre-r-sm);
  border: 1px solid var(--bre-line-3);
  background: var(--bre-surface);
  transition: border-color var(--bre-t) var(--bre-ease), box-shadow var(--bre-t) var(--bre-ease);
}
.bre-cap-box:hover { border-color: var(--bre-line-4); }
.bre-cap-box:focus-within {
  border-color: var(--bre-accent);
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
.bre-cap-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: none;
  outline: none;
  padding: 0;
  font: inherit;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--bre-ink);
}
.bre-cap-input::placeholder { color: var(--bre-ink-4); }
.bre-cap-input:disabled { color: var(--bre-ink-4); cursor: default; }
.bre-cap-unit {
  flex: none;
  font-size: 10.5px;
  letter-spacing: 0.02em;
  color: var(--bre-ink-4);
}
/* A warning note: the board keeps the sentence in quiet ink and puts the colour
   on the glyph alone, so a panel with two warnings does not read as two alarms.
   The headers pane has no glyph in its notes and re-colours them for itself. */
.bre-effort-note.bre-warn {
  color: var(--bre-ink-3);
}
.bre-effort-note.bre-warn svg { color: var(--bre-warn); }
/* ---- Composer model menu (mounted inside the OFFICIAL menu) ----
   The body and host sizing follow HanaAyane's dsh-reasoning-effort (MIT).
   The model and reasoning-level rows below use the current row/list UI. */
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
  content: attr(data-bre-provider) " \xB7 ";
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-weight: 400;
  white-space: nowrap;
}

/* ---- Model switcher body ----
   One quiet head names the current model; the provider and model columns are
   ALWAYS visible (no drill-in row); a resident search box sits above them; the
   reasoning level is switched in place on a single-accent track. No panel ever
   opens or closes, so the body's height is settled at mount and the commit paths
   carry no re-measure dance.

   The redesign's two rules on this surface: no boxed-in-box (the only strokes
   are the search's focus ring and one hairline between the columns), and one
   accent, spent only on "this is the selection". */
.bre-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* The head: a small caps-free label on the left, the current model pushed right
   with its provider muted behind it. The level used to be repeated here as a
   pill; it now lives once, in the footer, where it is also editable. */
.bre-menu-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 2px;
}
.bre-menu-cur {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  margin-left: auto;
}
.bre-menu-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -.005em;
  color: var(--bre-ink);
}
.bre-menu-prov {
  flex: none;
  font-size: 10.5px;
  color: var(--bre-ink-hint);
  white-space: nowrap;
}
/* The resident search. Deliberately its OWN class family (not the official
   pane's .bre-search-input-*): the replica and the official search box share a
   menu, and every probe that looks for the official box must not find the
   replica's. The box is a sunken well, not an outlined field: the field's stroke
   would be the second rectangle on a surface that already has the card's edge. */
.bre-menu-search { padding: 0; }
.bre-menu-search-box {
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
  height: 30px;
  padding: 0 4px 0 8px;
  box-sizing: border-box;
  border-radius: var(--bre-r-sm);
  background: var(--bre-sunken);
  border: 1px solid transparent;
  color: var(--bre-ink-4);
  transition: background var(--bre-t) var(--bre-ease), border-color var(--bre-t) var(--bre-ease),
    box-shadow var(--bre-t) var(--bre-ease);
}
.bre-menu-search-box:focus-within {
  background: var(--bre-surface);
  border-color: var(--bre-accent);
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
.bre-menu-search-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  color: inherit;
  pointer-events: none;
}
.bre-menu-search-icon svg { width: 13px; height: 13px; }
.bre-menu-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--bre-ink);
  font: inherit;
  font-size: 12.5px;
  line-height: 18px;
}
.bre-menu-search-input::placeholder {
  color: var(--bre-ink-4);
  opacity: 1;
}
.bre-menu-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: var(--bre-sunken-2);
  color: var(--bre-ink-3);
  cursor: pointer;
  transition: background var(--bre-t) var(--bre-ease), color var(--bre-t) var(--bre-ease);
}
.bre-menu-search-clear:hover {
  background: var(--bre-active);
  color: var(--bre-ink);
}
.bre-menu-search-clear svg { width: 12px; height: 12px; }
/* The provider cell's model count, where the drill chevron used to sit: the
   columns are always open, so the number is the only fact a chevron added. */
.bre-provider-count {
  flex: none;
  margin-left: auto;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--bre-ink-hint);
}
/* While the search holds a query the model column lists matches across every
   provider; the muted prefix says which one each row belongs to. */ 
.bre-option-origin { color: var(--bre-ink-hint); }
/* The footer: the reasoning level switched IN PLACE — its name on the left and
   the level under the thumb on the right, above a 6px track whose stops are
   tick marks and whose names are written under it. The track spans the full
   width, so each name sits under its own stop whatever the ladder's size. */
.bre-menu-foot {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
  border-top: 1px solid var(--bre-line-1);
}
.bre-menu-slider {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.bre-menu-slider:focus-within { outline: none; }
/* Layout only — it deliberately paints NO background, border, radius or
   overflow clip. The replica is mounted inside the OFFICIAL menu, and that
   shell already draws its own surface (MenuSurface: a [data-menu-material]
   panel whose .material child paints --dsw-menu-surface-fill, i.e.
   --dsw-specific-menu, under backdrop-filter: var(--dsw-menu-backdrop-filter),
   rounded by --dsw-radius-lg and outlined by --dsw-elevation-prominent).
   A second opaque card in here shows that official surface as a grey frame
   around it — two stacked surfaces where every other menu in the app has one. */
.bre-row-label {
  flex: none;
  font-size: 11.5px;
  line-height: 18px;
  font-weight: 500;
  letter-spacing: .02em;
  color: var(--bre-ink-hint);
}
.bre-row-value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 12.5px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: -.005em;
  color: var(--bre-accent-ink);
}
.bre-row-value.is-muted { font-weight: 400; color: var(--bre-ink-hint); }
.bre-panel {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 220px;
  overflow-y: auto;
  padding: 2px 6px 8px;
}
/* Provider column + model column of the model list, side by side. The height is
   FIXED: switching provider must not resize the card, or every click would need
   another same-frame re-place and any missed one shows as a jump. It is also
   BUDGETED: head + search + panel + footer must not exceed the height the
   official popover measured for the old two-row body, or the popover clips the
   footer's last line (切换模型下方被截断). The slider head above the track
   (.bre-effort-slider-head: 18px of text + 6px of margin) is paid for OUT of
   this height, so the card's total is unchanged. */
.bre-panel-models {
  flex-direction: row;
  align-items: stretch;
  gap: 0;
  height: 196px;
  max-height: none;
  overflow: hidden;
  padding: 0;
}
.bre-providers {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 104px;
  overflow-y: auto;
  padding-right: 4px;
}
.bre-provider-models {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  margin-left: 6px;
  padding-left: 6px;
  border-left: 1px solid var(--bre-line-1);
}
.bre-option,
.bre-provider {
  appearance: none;
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 30px;
  flex: none;
  padding: 0 6px 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--bre-ink);
  font: inherit;
  font-size: 12.5px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--bre-t) var(--bre-ease),
    color var(--bre-t) var(--bre-ease),
    opacity var(--bre-t) var(--bre-ease);
}
/* The provider cell reads one step quieter than its models: it is the index, the
   models are the content. */
.bre-provider { gap: 4px; color: var(--bre-ink-2); }
.bre-option:hover:not(:disabled),
.bre-provider:hover:not(:disabled) {
  background: var(--bre-hover);
}
/* User item 4 (the model list "went grey and flashed"): the row dim used to land
   and lift with no transition, so it read as a hard blink on every pick. It is
   also a gentler step now — .55 read as "disabled", which is not what a pick
   in flight means. Opacity is in the transition list above, so the fade is the
   same 160ms every other state change on the row uses. */
.bre-option:disabled,
.bre-provider:disabled { cursor: default; opacity: .72; }
.bre-option:focus-visible,
.bre-provider:focus-visible {
  outline: 2px solid var(--bre-accent);
  outline-offset: -2px;
}
.bre-option-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The selection: one accent tint, accent ink, and a 2px bar on the column's own
   edge — the bar is what keeps "open provider" readable once the row is tinted
   (a tint alone at 10% is a whisper in a 104px column). */
.bre-option.is-active {
  background: var(--bre-accent-weak);
  color: var(--bre-accent-ink);
  font-weight: 600;
}
.bre-provider.is-open {
  background: var(--bre-accent-weak);
  color: var(--bre-accent-ink);
}
.bre-provider.is-open::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 2px;
  background: var(--bre-accent);
}
.bre-provider.is-open .bre-provider-count { color: var(--bre-accent); opacity: .7; }
/* The provider of the CURRENT model keeps its name at full weight, so the column
   says where the selection lives even when another provider is open. */
.bre-provider.is-current .bre-option-name { font-weight: 600; color: var(--bre-ink); }
.bre-provider.is-open.is-current .bre-option-name { color: var(--bre-accent-ink); }
/* Capability badges on a model row (image input / thinking). Muted so the name
   stays the brightest thing in the row; the badge's own title carries the copy. */
.bre-option-tags {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--bre-ink-3);
  opacity: .78;
}
.bre-option.is-active .bre-option-tags { color: var(--bre-accent); opacity: .9; }
.bre-tag { display: inline-flex; align-items: center; }
.bre-tag-icon { display: block; width: 13px; height: 13px; }
/* The declared context window, spelled the way catalogues do (128K, 1M).
   Tabular digits so a column of them compares at a glance; muted like the
   badges, with its own title carrying the field copy. */
.bre-option-cap {
  flex: none;
  color: var(--bre-ink-3);
  opacity: .78;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.bre-option.is-active .bre-option-cap { color: var(--bre-accent); opacity: .9; }
.bre-empty { padding: 8px; font-size: 12px; color: var(--bre-ink-hint); }

/* ---- Truncated-label tooltip (custom, replaces the native title) ----
   A self-drawn bubble instead of the OS tooltip, which the page cannot style
   and which reads harsh next to the menu. Fixed-positioned on <body> so the
   menu's own overflow/clip cannot cut it, aligned under the truncated span,
   capped to the viewport with wrap for very long names. */
.bre-tip {
  position: fixed;
  z-index: 2147483647;
  max-width: min(360px, calc(100vw - 24px));
  box-sizing: border-box;
  padding: 5px 9px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform, #232630);
  color: var(--dsw-alias-label-primary, #f2f3f5);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
  white-space: normal;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .22);
  animation: bre-tip-in 120ms ease-out;
}
body:not([data-ds-dark-theme]) .bre-tip {
  background: #ffffff;
  color: var(--dsw-alias-label-primary, #1f2329);
  box-shadow: 0 4px 16px rgba(0, 0, 0, .14), 0 0 0 .5px var(--dsw-alias-border-l4, rgba(0, 0, 0, .1));
}
@keyframes bre-tip-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .bre-tip { animation: none; }
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
/* upstream re-model-error: the directory/store error line under the row */
.bre-model-error {
  margin: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--dsw-alias-state-error-primary, #c83e4d);
  background: var(--dsw-alias-state-error-tertiary, rgba(220,55,70,.08));
  font-size: 11px;
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
.bre-slider-setting-switch.is-on { background: var(--dsw-alias-brand-primary, #4d6bfe); }
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
/* The head is a plain title row on the card's own white — the tinted strip it
   used to be drew a second bar inside the card (user item 3). 全部清空 sits at
   the far right, blue like the host's other text actions. */
.bre-headers-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0;
  background: none;
}
.bre-headers-head .bre-effort-title {
  color: var(--dsw-alias-label-primary, #0f1115);
  font-weight: 600;
}
.bre-headers-clear {
  margin-left: auto;
  padding: 0 2px;
  border: none;
  background: none;
  color: var(--dsw-alias-link, #4d6bfe);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.bre-headers-clear:hover:not(:disabled) { text-decoration: underline; }
.bre-headers-clear:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
.bre-headers-edit, .bre-headers-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Columns and rows share one grid so the captions sit over their inputs. The
   row itself is bare: the inputs are the boxes, a second border around the
   pair was the old "framed row" look (board image 4). */
.bre-headers-columns,
.bre-headers-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(180px, 1.6fr) 28px;
  align-items: center;
  gap: 10px;
}
.bre-headers-columns {
  padding: 0 2px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 12px;
  line-height: 18px;
}
.bre-headers-row {
  min-height: 0;
  padding: 0;
  border: none;
  background: none;
}
.bre-headers-edit .bre-headers-row { min-height: 38px; }
.bre-headers-add {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border: 1px dashed var(--dsw-alias-border-l3, #0000001f);
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.bre-headers-add::before {
  content: '+';
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 17px;
  line-height: 1;
}
.bre-headers-add:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l4, #00000033);
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
.bre-headers-add:disabled { opacity: 0.5; cursor: default; }
.bre-headers-remove {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.bre-headers-remove:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
  color: var(--dsw-alias-label-primary, #0f1115);
}
.bre-headers-remove:disabled { opacity: 0.5; cursor: default; }
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
   actions: a filled commit and a bordered dismiss, 36px tall at 14px.
   .bre-headers-actions is the same pair pulled OUT of the header editor: in
   the 高级配置 pane the row closes the whole pane, so it sits after every
   section and must not inherit the rows' size rules from a parent that is no */
.bre-headers-edit .bre-primary-button,
.bre-headers-actions .bre-primary-button {
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
.bre-headers-edit .bre-primary-button:hover:not(:disabled),
.bre-headers-actions .bre-primary-button:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #43454a);
}
.bre-headers-edit .bre-primary-button:disabled,
.bre-headers-actions .bre-primary-button:disabled { opacity: 0.5; cursor: default; }
.bre-headers-edit .bre-secondary-button,
.bre-headers-actions .bre-secondary-button {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l3, #0000001f);
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 14px;
}
.bre-headers-edit .bre-secondary-button:hover:not(:disabled),
.bre-headers-actions .bre-secondary-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
/* The row that closes the pane. In the fold it gets room, not a rule: the pane
   already carries its divider on its title row, so a line here would draw a
   second one with nothing between them to divide. */
.bre-headers-actions {
  padding-top: 12px;
}

/* Under the tabs the row is the card's ONLY commit row — the takeover hides the
   official footer's body on this pane — so it wears the footer dress the other
   two panes inherit from the official row: one hairline above, the pair
   right-aligned beneath it, matching that row's 6px margin / 12px padding / 1px
   hairline (the padding is the base rule's, just above). The advanced pane's
   保存 was the only commit button without that divider. The rule belongs to the
   row that carries the pane's own save: the deferred variant (the
   create-provider card) has none and commits with the card's kept footer row,
   which already wears its own divider — a line here would stack a second one
   directly above it. */
.bre-headers[data-bre-region='advanced'] .bre-headers-actions:has(.bre-primary-button) {
  margin-top: 6px;
  border-top: 1px solid var(--dsw-alias-border-l2, #0000001a);
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

/* The section's own fields, on the official input box: 38px tall and full
   width, so the pair reads as one table row like board image 4. */
.bre-headers-edit input.bre-text-input {
  max-width: none;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l3, #0000001f);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 13px;
  box-sizing: border-box;
}
.bre-headers-edit input.bre-text-input:focus {
  border-color: var(--dsw-alias-brand-primary, #4d6bfe);
  box-shadow: 0 0 0 3px var(--dsw-alias-brand-primary-muted, rgba(77, 112, 255, .14));
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) 28px;
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
   Keep the host grid's class distinct from the composer's row controls so
   shared naming cannot lend menu-row styling to the host's grid. */
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

/* The blank a shrinking model list leaves behind, appended to the panel's own
   scroll host (see holdListSlack in models-page-editor): it holds the host's
   scroll RANGE open so deleting a row cannot clamp the view down. Height is
   written inline from the script — it is the range being held, not a style —
   and the element must never take layout from above or a pointer from the user. */
.bre-list-slack {
  flex: 0 0 auto;
  pointer-events: none;
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

/* ---- Provider balance chip (Models page) ---- */

/* Leads the enable switch as context, not as a control: a quiet pill that must
   never read like a button, and never pushes the switch out of line. Tabular
   figures keep two providers' amounts from jittering as the page rescans. The
   pill holds the amount and, AFTER it, the small refresh control. */
.bre-provider-balance {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  max-width: 168px;
  margin-right: 8px;
  padding: 1px 4px 1px 8px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-tertiary, #eef0f4);
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
}

.bre-provider-balance-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* The icon is a real button (16×16 hit area, 12px glyph) but visually part of
   the pill: quiet until hovered, and it never widens the amount's ellipsis
   budget — the text column shrinks, the control stays. */
.bre-provider-balance-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: inherit;
  cursor: pointer;
  opacity: .7;
}

.bre-provider-balance-refresh svg { width: 12px; height: 12px; }

.bre-provider-balance-refresh:hover {
  opacity: 1;
  background: var(--dsw-alias-bg-quaternary, #e2e5ea);
}

.bre-provider-balance-refresh:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 1px;
}

.bre-provider-balance-refresh.is-spinning svg {
  animation: bre-balance-spin .8s linear infinite;
}

@keyframes bre-balance-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .bre-provider-balance-refresh.is-spinning svg { animation: none; }
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

/* ---- The folded group of switched-off providers (Models page) ---- */

/* A switched-off provider keeps its row — that is where it is switched back on —
   but it does not have to stay in the list the user reads. The row keeps its DOM
   slot (the drag pass reads its slots back out of there) and is ordered behind
   the group's control instead, so unfolding shows the group UNDER that control
   rather than scattered through the providers that are on.

   !important, because the drag passes write an inline order onto the rows they
   arrange: a folded row is not one of the rows the user is arranging, so the
   tail belongs to this stylesheet, not to the last drag that ran. */
.bre-row-folded { order: 1001 !important; }

/* The seat: the list item that carries the control, in front of the folded rows
   and behind every provider that is switched on. It is a list item of the host's
   own flex column — the only place from which a control can head rows inside the
   list — and it holds no card of its own, only the quiet end of the host's text
   scale. */
.bre-provider-disabled-seat {
  box-sizing: border-box;
  order: 1000 !important;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bre-provider-disabled-group {
  box-sizing: border-box;
  display: block;
  width: 100%;
  margin: 4px 0 0;
  padding: 4px 2px;
  border: none;
  background: 0 0;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}

.bre-provider-disabled-group:hover { color: var(--dsw-alias-label-secondary, #61666b); }

.bre-provider-disabled-group:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 2px;
}

/* The folded row itself. !important because the official card class decides its
   own display, and this stylesheet's order against the host's is not ours to
   rely on. */
.bre-row-hidden { display: none !important; }

/* A row action held by the settle guard (settle-guard.ts): the host has disabled
   the button for the post-apply reload, but the save already answered the click
   and the list is not what changed. The attribute stays on the element only
   while that reload runs — it is the painted opacity that is restored here, not
   the disabled state, so the button stays inert exactly as long as the host
   means it to. !important, because the official :disabled rule is what sets
   the .4. */
[data-bre-settle] { opacity: 1 !important; }

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
/* The tab bar. The old segmented track (grey rail + lifted white pill) is
   retired for the underline form the redesign settles on: a quiet text row over
   one hairline, the active tab named by a brand bar under its own text — one
   emphasis, no second surface to stack on the card's. */
.bre-editor-tabs {
  display: none;
  gap: 20px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #0000001a);
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

/* The create-provider card's CUSTOM form has no slot to render a bar into: the
   official page dispatches the provider-card slot inside the catalogue half
   only, so the create-card pass (injection/add-card.ts) mounts a bar of its own
   at the top of the form. Same contract as the mount above — hidden until the
   pass marks the card, the card's own gap rhythm once it does — so an
   untaken-over card is exactly the official one. */
.bre-create-host {
  display: none;
}
.bre-tabbed .bre-create-host {
  display: block;
}

/* User item 6: every card on the settings page carried a tinted base fill — the
   configured row's card, the add/setup card, the editor body inside it, the
   advanced pane — so a stack of cards read as a stack of grey blocks on a white
   page. The card's own hairline is what draws it here; the fill steps back to
   the page's background, which is the one value that is "no colour" in both
   themes (bg-base is the content surface the page itself paints).
   The marks are the plugin's own where it has one (data-bre-editor-body is the
   tag this takeover puts on the official editor), and the official module card
   stems where it does not: those class names carry a build hash, so they are
   matched by stem and never spelled out. */
.bre-tabbed [class*='rowCard'],
.bre-tabbed [class*='addCard'],
.bre-tabbed [class*='setupCard'],
.bre-tabbed [data-bre-editor-body],
/* The add-provider card is not a DESCENDANT of the takeover: the takeover sits
   inside it. The add-card pass marks the card itself, and this pair of
   selectors is what turns its module-platform fill into the page's white. */
[class*='addCard'][data-bre-add-card='1'] {
  background: var(--dsw-alias-settings-card-fill, #ffffff);
}

/* The advanced pane is whitened where its own rule is defined, further down. */

/* With the custom API form the only way left to add a provider, the official
   "How to add" switch has nothing to switch. The pass hides it ONLY once that
   form is really up: a card that has no custom form to offer, or a takeover
   that stepped back, keeps the switch — and with it the official explanation
   of why the other half is unavailable. */
.bre-add-mode-picker {
  display: none;
}

.bre-editor-tab {
  flex: 0 1 auto;
  min-width: 0;
  height: 32px;
  padding: 0 2px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #61666b);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  position: relative;
  transition: color 140ms ease;
}

.bre-editor-tab:hover { color: var(--dsw-alias-label-primary, #0f1115); }

/* The selected tab is named by the bar under its own text, not by a filled
   pill: the indicator occupies the bar's own hairline, so no second surface
   and no extra height. Hover on a selected tab stays put — it is already
   where you are. */
.bre-editor-tab::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background 140ms ease;
}

.bre-editor-tab[aria-selected='true'],
.bre-editor-tab[aria-selected='true']:hover {
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-weight: 500;
  box-shadow: none;
}

.bre-editor-tab[aria-selected='true']::after {
  background: var(--dsw-alias-brand-primary, #4d6bfe);
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
.bre-tabbed:not([data-bre-tab='fingerprint']) [data-bre-region='fingerprint'],
.bre-tabbed:not([data-bre-tab='advanced']) [data-bre-region='advanced'] {
  display: none !important;
}

/* The provider pane's form reads as the redesign's two-column grid: the label
   takes a fixed leading column, the control fills the rest. Promoting the
   host label's children with display:contents keeps the label-input
   association (the label element stays the control's parent in the DOM) while
   letting the span and the control land in their own columns. Scoped to the
   taken-over provider pane and the host's measured field shape, so a kernel
   that changed its markup simply keeps its own stacked layout. The endpoint
   field opts out: its family chip + title row is its own shape (the design's
   endpoint row), and its title carries the 更多端点 toggle besides. */
.bre-tabbed[data-bre-tab='provider'] [data-bre-editor-body] .field:not([data-bre-endpoint-field]) {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
}
.bre-tabbed[data-bre-tab='provider'] [data-bre-editor-body] .field:not([data-bre-endpoint-field]) > label {
  display: contents;
}
/* The input sits BESIDE its label — the same two-column shape on every card,
   create or edit (新增供应商的 api 密钥字段与修改卡不一致). A field with no
   label of its own (the provider id on the create card) spans the form instead
   of squeezing into the label column. The endpoint field's input keeps its own
   grid's second column — the same specificity race, won back explicitly. */
.bre-tabbed[data-bre-tab='provider'] [data-bre-editor-body] .field > input { grid-column: 2; }
.bre-tabbed[data-bre-tab='provider'] [data-bre-editor-body] .field:not(:has(> label)) > input { grid-column: 1 / -1; }
.bre-tabbed[data-bre-tab='provider'] [data-bre-editor-body] [data-bre-endpoint-field] > input { grid-column: 2; }
/* The extra address rows need no indent of their own: their chip is the same
   fixed 96px prefix the field's chip takes, so the row's input already sits in
   the field input's column (see .bre-endpoint-family above). */
/* The card's commit row reads as the footer the design gives every card: one
   hairline above, the pair right-aligned beneath it, on every tab that shows
   the card's own fields. */
.bre-tabbed [data-bre-editor-body] [class*='editorActions'] {
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2, #0000001a);
}

/* The advanced tab: the official body — fields, model list — steps aside for the
   request-header section, which is a complete form with its own save/cancel and
   becomes the pane under the very same bar. What does NOT step aside is the
   card's own commit row wherever the pass has marked one (data-bre-footer): on
   the create card that row IS the 创建提供商 this pane's draft is written with,
   and a user who has just typed the headers is standing on this tab. An ordinary
   card keeps the old behaviour — its body steps aside wholesale, advanced pane
   and save included, because that pane carries a save of its own. */
.bre-tabbed[data-bre-tab='advanced'] [data-bre-editor-body]:not([data-bre-footer]) {
  display: none !important;
}

/* A card whose commit row is kept: the body and every wrapper on the path to that
   row stay, but inside them only the path shows. The row is marked 'row' and not
   'path' on purpose: a wrapper's unmarked children are exactly the fields and
   layout the tab is stepping away from, while the row's children are the buttons
   being kept. Panes the tabs own stay hidden by the region rule above. */
.bre-tabbed[data-bre-tab='advanced'] [data-bre-footer='path'] > *:not([data-bre-footer]) {
  display: none !important;
}

/* The advanced pane shows the section for the same reason the mount is shown:
   a pane that is already the active one has no business depending on the
   official-edit probe. The rule above still wins for every other tab, and the
   base bre-headers rule keeps a collapsed card's section hidden — a card only
   carries the taken-over class while its editor is open. */
.bre-tabbed[data-bre-tab='advanced'] .bre-headers { display: flex; }

/* The pane is a card, and the section draws it. On the advanced tab the section
   is not an appendage to the fields above it any more — it is the whole surface.
   The hairline goes: it divided this section from those fields, and here the bar
   above ends the pane. The 12px top margin sets the card off the tab bar above
   it — the same gap the provider and models panes put between the bar and their
   own cards — and the 12px padding is the card's inner inset, not the separator.
   User item 3: the fill is the page's own background, not the tinted module
   platform. The pane sits on a white card; a grey slab there was a second card
   drawn inside the first. Its inset is carried by the padding and the bar's
   hairline, so dropping the fill costs no structure. */
.bre-tabbed[data-bre-tab='advanced'] .bre-headers {
  margin-top: 12px;
  padding: 12px;
  border-top: none;
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-base, #ffffff);
}

/* The pane's heading is not a fold head. The grey pill, its hover state and
   the › that opens the card section have no job in a pane that is always open
   and named by the tab above it, so the title drops back to plain text. It
   keeps the title row's weight the section uses everywhere else — the head
   strip and the hint both step aside for it, which is what makes the title
   the line the hint reads under rather than an equal of it. */
.bre-tabbed[data-bre-tab='advanced'] .bre-headers-head {
  min-height: 0;
  padding: 0;
  background: none;
}
.bre-tabbed[data-bre-tab='advanced'] .bre-headers-head .bre-effort-title {
  font-size: 13px;
  line-height: 20px;
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
   says. align-items centres the taller host links against the seat.

   The pin must NOT wait for the seat to exist: a card with no models shows the
   fetch link alone, and space-between puts a lone child at the START — so the
   link sat at the left edge until the first fetch seated the control beside it
   and shoved it right, the jump the user reported. Hence two selectors: the
   link that the seat follows, and the fetch link while it is still the LAST
   control of the head (the seat is a button too, so a last-of-type selector
   alone would eventually pin the seat instead). Either way the link holds the
   right edge from the first paint to the last. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelListHead'] {
  align-items: center;
}
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelListHead'] > button:has(+ .bre-auto-effort),
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelListHead'] > button:not(.bre-auto-effort):last-of-type {
  margin-left: auto;
}

/* The Fingerprint pane keeps the body under it too, and the "Customized" group
   stands there as an empty shell wearing its separator: on this tab every child
   of the group is a pane claim (the identity fields, the catalogue) or the
   dismissed summary, so the .5px line sat over a bare 22px strip between the
   pane above and the commit row below. The separator's job is to divide the
   group from the key field above it — this tab shows neither — so it goes, with
   the group's and its body's top padding, the same way the Models pane's did.
   The commit row's own hairline stays: it is the footer divider every tab's
   save row wears, and the shell's was the second line the pane had no use for. */
.bre-tabbed[data-bre-tab='fingerprint'] [data-bre-editor-body] details[class*='customized'] {
  border-top: none;
  padding-top: 0;
}

.bre-tabbed[data-bre-tab='fingerprint'] [data-bre-editor-body] details[class*='customized'] > [class*='customizedBody'] {
  padding-top: 0;
}

/* The click's answer, as a bubble at the top of the window that takes itself
   away again — and the official save line's answer too
   (injection/saved-notice.ts), which is raised the same way with the same
   done phase, so one shape covers both. The control is left alone on
   purpose: its label is what the user aimed at, and a button that rewrites
   itself is a button that moved. The
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
  /* User item 5: room for one key row plus the add row, reserved before the list
     answers. The panel renders nothing while its read is in flight, so without
     this the card painted at its short height and then grew by a row's height
     when the keys arrived — the card visibly re-flowing just after it opened.
     The reservation is the height the list settles at (40px row + 8px gap + 34px
     add row + the list's own two 1px rules), so nothing moves once it lands. */
  min-height: 84px;
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
  border-radius: var(--dsw-radius-md, 12px);
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
  /* The hovered row lifts a shade, the way the redesign's list rows do — the
     container clips the corners, so the fill stays inside the ruled box. */
  transition: background 120ms ease;
}

.bre-keys-row:hover { background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .07)); }

/* The switch at the head of every key row: a ring with a check inside it. While
   the key is switched into use the WHOLE icon is the brand blue — ring and glyph
   together; while it is benched it is a bare grey ring with nothing drawn in it.
   Off is a pause, not a deletion — the label, scope and protocol stay. With
   several keys coexisting there is no "default" badge: which key signs a model
   is the scope's decision. The one state that cannot be clicked is the last
   enabled key: the host would refuse the switch-off, so the control stands down
   instead (the disabled shell keeps the lit look — the key IS selected). */
.bre-keys-toggle {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  transition: opacity 140ms ease;
}

.bre-keys-toggle:hover:not(:disabled),
.bre-keys-toggle:focus-visible { opacity: 0.8; }

.bre-keys-toggle:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3);
  border-radius: 999px;
}

.bre-keys-toggle:disabled { cursor: default; }

.bre-keys-toggle-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-label-tertiary, #9aa1ab);
  color: transparent;
  transition: box-shadow 140ms ease, color 140ms ease;
}

.bre-keys-toggle-mark svg {
  width: 10px;
  height: 10px;
  display: none;
}

/* The lit check is PINNED to the plugin's own blue rather than the host's brand
   token: on the settings surface --dsw-alias-brand-primary can resolve dark —
   and a var() fallback only covers a token that is unset, so a token defined
   with a broken value leaves the tick inheriting the body's near-black ink. A
   checked key must read blue wherever the list is painted, so the blue is not
   negotiable with the surface. */
.bre-keys-toggle.is-on .bre-keys-toggle-mark {
  box-shadow: inset 0 0 0 1.5px #4d6bfe;
  color: #4d6bfe;
}

.bre-keys-toggle.is-on .bre-keys-toggle-mark svg { display: block; }

/* A switched-off key stays listed but reads as idle: its name and preview dim,
   while the actions keep their full strength so the row stays workable. */
.bre-keys-row.is-off .bre-keys-alias,
.bre-keys-row.is-off .bre-keys-mask { opacity: 0.45; }

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
   them, because a hidden action there would be an unreachable one. The model
   scope rides on its own button here (its label is the count), so there is no
   separate summary text beside the key any more. The tray parks at the right
   edge: no status word is painted on a row any more (状态都移除——东西多了，
   别名被省略), so the right edge is the tray's alone. */
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

/* The scope field spans the row like the secret field does. */
.bre-keys-scope { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.bre-keys-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, #6b7280);
}

/* The discover action sits below the ruled list because it acts on every key at
   once, not on the row it would otherwise live in. */
.bre-keys-footer { display: flex; justify-content: flex-end; }

/* The offer to add the models the keys advertise but the provider does not
   declare: one sentence and one link, never a silent write. */
.bre-keys-note {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #6b7280);
}

.bre-keys-add-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.bre-keys .bre-effort-message { font-size: 11px; }

/* The per-key protocol picker. It lives inside .bre-keys-actions, so it must
   look like the plain buttons beside it — same size, same grey, no box of its
   own — or the hover tray reads as two different kinds of control. "Default
   protocol" (the empty value) follows the route's own API protocol.
   What you read is a LABEL, not a control: a native <select> is as wide as its
   widest OPTION, so a short value left the chevron floating a hundred pixels to
   its right (user item 2). The button is exactly as wide as the text and opens
   this module's own menu, which can explain each protocol (参考图样式). */
.bre-keys-protocol-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--dsw-alias-label-secondary, #61666b);
}

.bre-keys-protocol {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 0;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.bre-keys-protocol-label {
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 1;
}

.bre-keys-protocol-caret {
  color: inherit;
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
}

/* Hover is a shade, not an underline: the picker reads as a control (every
   other quiet control in the row lifts on hover), and an underline made it
   read as a link to somewhere else. */
.bre-keys-protocol:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.08)); }

/* An open menu is a pressed control: while its list is up, the trigger keeps the
   tray's colour instead of going back to quiet grey. */
.bre-keys-protocol[aria-expanded='true'] { color: var(--dsw-alias-label-primary, #0f1115); }

.bre-keys-protocol:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

.bre-keys-protocol:disabled { opacity: 0.5; cursor: default; }

/* ---- The protocol menu ----
   One entry per protocol, its name over the line that says what that wire is
   for: the names alone do not tell Chat Completions and Responses apart, and the
   choice is about the models behind the key (user request, 参考图样式). Portalled
   onto <body> because the key list clips its overflow; the panel wears the same
   surface, radius and hairline as the app's own menus. */
.bre-protocol-menu {
  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  width: 292px;
  padding: 6px;
  border-radius: 12px;
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, .1));
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  box-shadow: 0 8px 28px rgba(0, 0, 0, .16), 0 2px 6px rgba(0, 0, 0, .08);
  animation: bre-protocol-menu-in 120ms ease-out;
}

@keyframes bre-protocol-menu-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}

.bre-protocol-menu-title {
  margin: 0;
  padding: 6px 10px 4px;
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 12px;
  line-height: 18px;
}

.bre-protocol-menu-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bre-protocol-option {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-primary, #0f1115);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.bre-protocol-option:hover { background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09)); }

.bre-protocol-option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

/* The choice in force is named the way the redesign names every selection:
   the accent lives in the TITLE and the tick, and the row keeps the menu's
   own surface — the grey pillow made the answer look pressed rather than
   current. The tick rides the right edge (order + auto margin — the DOM
   keeps the mark before the text), so the text column starts flush. */
.bre-protocol-option-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  order: 2;
  width: 12px;
  height: 18px;
  margin-left: auto;
  margin-top: 2px;
  color: var(--dsw-alias-brand-primary, #4d6bfe);
}

.bre-protocol-option[aria-selected='true'] { background: transparent; }

.bre-protocol-option[aria-selected='true']:hover {
  background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09));
}

.bre-protocol-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* One line each, always: a wrapped hint made one row taller than its neighbours
   and the column of ticks lost its rhythm. A hint too long for the panel is cut
   with an ellipsis rather than allowed to reflow the list. */
.bre-protocol-option-title,
.bre-protocol-option-hint {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bre-protocol-option-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}

.bre-protocol-option[aria-selected='true'] .bre-protocol-option-title {
  color: var(--dsw-alias-brand-primary, #4d6bfe);
  font-weight: 500;
}

.bre-protocol-option-hint {
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 12px;
  line-height: 16px;
}

@media (prefers-reduced-motion: reduce) {
  .bre-protocol-menu { animation: none; }
}

/* The key list's own links read as plain grey text: a row can carry four of them
   and blue made them compete with the value they act on (user item 3). Danger
   keeps its hue, and the scope form's primary shortcuts stay untouched. */
.bre-keys-actions .bre-link-button { color: var(--dsw-alias-label-secondary, #61666b); }
.bre-keys-actions .bre-link-button:hover { color: var(--dsw-alias-label-primary, #0f1115); }
.bre-keys-actions .bre-keys-danger { color: var(--dsw-alias-state-error-primary, #d33); }

/* The API protocol as ONE segmented bar: one segment per protocol, the one in
   force sitting in a white pill on a shared grey track, so the alternatives read
   as parts of a single choice instead of three loose buttons (user item 1). The
   host's own <select> stays in the DOM behind them — hidden by the module, not
   removed — because it is what the host saves and what this module reads the
   family from. */
.bre-protocol-cards {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09));
}

.bre-protocol-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-width: max-content;
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #61666b);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  text-align: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.bre-protocol-card:hover { color: var(--dsw-alias-label-primary, #0f1115); }

.bre-protocol-card.is-selected {
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  box-shadow: 0 1px 2px #0000001a, 0 0 0 1px var(--dsw-alias-border-l2, #0000001a);
}

.bre-protocol-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

/* The provider card's address tag: the protocol family the base URL serves.
   A hairline pill, the redesign's quiet badge: centred text inside a 999
   capsule, never a control. The width is FIXED at the form's label column:
   OpenAI and Anthropic chips then share one 96px prefix column, so
   the field's input and every 更多端点 row's input start at the same x —
   a min-width column would drift with each family's name length. */
.bre-endpoint-family {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 96px;
  height: 22px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3, #0000001f);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: nowrap;
}

/* The tag sits BESIDE the address input, not stacked above it. The official
   field is a column flex box (title, then control), so a tag inserted before the
   control would get a line of its own; a marked field becomes a two-column grid
   instead — the title keeps the full width, the tag takes the first column and
   the input the second. The first column is the SAME 96px the rest of the form
   labels take, so every input on the card starts at one vertical line. */
[data-bre-endpoint-field] {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  /* One rhythm for the whole address block: the field's own lines AND the
     更多端点 rows inside it sit a fixed 8px apart, so the three address
     inputs read as one evenly spaced stack (API 地址三个输入框间距不一样). */
  row-gap: 8px;
}

[data-bre-endpoint-field] > [data-bre-endpoint-title] { grid-column: 1 / -1; }

[data-bre-endpoint-field] > .bre-endpoint-family { grid-column: 1; }

[data-bre-endpoint-field] > input {
  grid-column: 2;
  width: 100%;
}

/* The injected second address rows. They are GRID ITEMS of the address field
   (the container is transparent to layout), so each row spans both columns and
   inherits the field's own row-gap — the uniform spacing the three address
   lines share. Collapsed until 更多端点 is pressed. The [hidden] rule is not
   redundant: the display rule below beats the user agent's [hidden] rule, so
   without this companion the rows would be on screen from the moment they are
   injected. */
[data-bre-endpoint-rows] { display: contents; }

[data-bre-endpoint-rows][hidden] { display: none; }

.bre-endpoint-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.bre-endpoint-row[hidden] { display: none; }

/* The injected second row's own input. The shared input caps itself at 240px for
   the narrow panels it was written for; beside a full-width address box that cap
   showed up as a short field under a long one (user item 5), so the row's input
   takes the column the main input takes. */
.bre-endpoint-url {
  flex: 1 1 auto;
  min-width: 0;
  max-width: none;
}

/* 更多端点: a small grey link riding the API 地址 label line itself, right after
   the label text (user item 4). The official label is an inline-flex box, so the
   link simply joins its children and the host's own 10px gap spaces it from the
   words; the row it reveals still opens directly under the field group. */
.bre-endpoint-toggle {
  display: inline-flex;
  align-items: center;
  margin: 0 0 0 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
}

.bre-endpoint-toggle:hover { color: var(--dsw-alias-label-primary, #0f1115); text-decoration: none; }

/* The disclosure mark is DRAWN, not typed: two 1.5px strokes make the thin
   chevron of the reference, and it turns over when the row opens instead of
   being swapped for a second glyph (user item 2). */
.bre-endpoint-toggle::after {
  content: '';
  width: 5px;
  height: 5px;
  margin-left: 4px;
  margin-top: -2px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  transition: transform 140ms ease, margin-top 140ms ease;
}

.bre-endpoint-toggle[aria-expanded='true']::after {
  margin-top: 2px;
  transform: rotate(225deg);
}

.bre-endpoint-toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
  border-radius: 4px;
}

/* The model-scope chips: the models the provider actually offers, each a toggle.
   A selected chip takes the brand tint and a tick, so a quick glance tells which
   models this key claims without reading a list of ids. */
.bre-keys-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bre-keys-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--dsw-alias-line-regular, #d8dbe2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}

.bre-keys-chip:hover { border-color: var(--dsw-alias-brand-primary, #3b82f6); }

.bre-keys-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

.bre-keys-chip:disabled { opacity: 0.55; cursor: default; }

/* A selected chip takes the accent tint and a tick; the outline steps aside —
   the tint IS the border, and a second one doubled the weight. */
.bre-keys-chip.is-selected {
  border-color: transparent;
  background: var(--dsw-alias-brand-primary-muted, #eef2ff);
  color: var(--dsw-alias-brand-primary, #3b82f6);
}

.bre-keys-chip-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
}

.bre-keys-chip-mark > svg { width: 12px; height: 12px; }

/* "All models" is a quiet text action inside the scope form's action row. */
.bre-keys-allmodels { margin-right: auto; }

/* The provider's two base URLs: one OpenAI-style, one Anthropic. Kept together
   below the key list because they belong to the route, not to any one key. */
.bre-keys-endpoints {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-line-faint, #eceef2);
}

.bre-keys-endpoint-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bre-keys-endpoint-label {
  flex: 0 0 auto;
  width: 104px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}

.bre-keys-endpoint {
  flex: 1 1 auto;
  min-width: 0;
  height: 26px;
  font-size: 12px;
}

.bre-keys-endpoint-actions { display: flex; justify-content: flex-end; }

/* ============================================================================
   Quiet Precision — the settings surfaces, stated once.

   The blocks below re-describe the key list, the protocol picker, the address
   rows and the provider card's protocol strip in the redesign's language. They
   are APPENDED rather than woven into the rules above on purpose: those rules
   still say what each control IS (a toggle, a menu, a row), and this block only
   says how it should look, so the two can be diffed when the plugin is next
   touched. Later rules win, so nothing above needs deleting.

   Three habits it enforces:
     1. Grouping is spacing and a heading's job. A box inside a box inside a box
        is what the old panels read as, so the key list loses its outer rule and
        keeps only the hairline between rows.
     2. One accent, and it only ever means "this one". Chosen states are a tint
        plus accent ink — never a solid fill, never a tick.
     3. Nothing moves when a state changes: no control grows a glyph on select,
        because a list that widens under the pointer is a list that misclicks.
   ========================================================================= */

/* The provider card's protocol strip: four wires, each with a share of the row's
   whole width, so the chosen one reads as a segment of the field rather than a
   chip floating in it. */
.bre-protocol-cards {
  display: flex;
  width: 100%;
  box-sizing: border-box;
  gap: 2px;
  padding: 2px;
  border-radius: var(--bre-r-sm);
  background: var(--bre-sunken);
}

.bre-protocol-card {
  flex: 1 1 0;
  height: 28px;
  min-width: 0;
  padding: 0 6px;
  border-radius: 6px;
  color: var(--bre-ink-2);
  font-size: 12px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bre-protocol-card:hover {
  color: var(--bre-ink);
  background: var(--bre-hover);
}

.bre-protocol-card.is-selected {
  background: var(--bre-accent-weak);
  color: var(--bre-accent-ink);
  font-weight: 500;
  box-shadow: inset 0 0 0 1px var(--bre-accent-line);
}

.bre-protocol-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}

/* The address field: the endpoint's name and its input on ONE line, the name
   column measured against the longest name it can hold (Anthropic) rather than
   padded out — a wider column only buys empty space between the two. */
[data-bre-endpoint-field] {
  grid-template-columns: 76px minmax(0, 1fr);
  column-gap: 6px;
  row-gap: 6px;
}

.bre-endpoint-family {
  width: 76px;
  height: 24px;
  justify-content: flex-start;
  gap: 6px;
  padding: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  color: var(--bre-ink-3);
  font-size: 11.5px;
  font-weight: 400;
}

/* The dot names the endpoint's state without a second word: filled once that
   family has an address, hollow while it is still unset. */
.bre-endpoint-family::before {
  content: '';
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--bre-line-4);
}

.bre-endpoint-family[data-bre-endpoint-filled='1']::before { background: var(--bre-ok); }

.bre-endpoint-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  column-gap: 6px;
  align-items: center;
}

.bre-endpoint-url {
  height: 30px;
  border-radius: var(--bre-r-sm);
}

/* 更多端点 and the tally that rides beside it: two quiet words on the field's
   label line, never a control that looks like another field. */
.bre-endpoint-toggle {
  height: 18px;
  margin: 0 0 0 4px;
  padding: 0 4px;
  border-radius: 5px;
  color: var(--bre-accent);
  font-size: 11.5px;
}

.bre-endpoint-toggle:hover {
  color: var(--bre-accent-ink);
  background: var(--bre-accent-weak);
}

/* The key list: rows kept apart by a hairline round the block and between the
   rows. User item 2: with the block's rule removed and the divider at line-1
   (a 4% black, invisible on white), a resting list read as loose text floating
   in the card — the row only existed while the pointer was on it. The box is
   back, in the same hairline the other groups use, so the extent of a row is
   legible before it is hovered. */
.bre-keys-list {
  border: 1px solid var(--bre-line-2);
  border-radius: var(--bre-r-sm);
  overflow: hidden;
}

.bre-keys-list > li + li { border-top: 1px solid var(--bre-line-2); }

.bre-keys-row {
  gap: 8px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 0;
  transition: background var(--bre-t) var(--bre-ease);
}

.bre-keys-row:hover { background: var(--bre-hover); }

/* The enable check: a ring that fills. Filled is accent with a white tick, empty
   is a grey ring with nothing in it — the two readings of a checkbox, drawn at
   the list's own scale. (The tick is the STATE of one control, which is why it
   survives the no-glyph-on-select rule above: it lives inside the switch, so
   lighting it cannot change the row's width.) */
.bre-keys-toggle-mark {
  width: 18px;
  height: 18px;
  box-shadow: inset 0 0 0 1.5px var(--bre-line-4);
  transition: background var(--bre-t) var(--bre-ease), box-shadow var(--bre-t) var(--bre-ease);
}

.bre-keys-toggle-mark svg {
  width: 11px;
  height: 11px;
}

.bre-keys-toggle.is-on .bre-keys-toggle-mark {
  background: var(--bre-accent);
  box-shadow: inset 0 0 0 1.5px var(--bre-accent);
  color: #ffffff;
}

.bre-keys-toggle:focus-visible {
  box-shadow: none;
}

.bre-keys-toggle:focus-visible .bre-keys-toggle-mark {
  box-shadow: inset 0 0 0 1.5px var(--bre-line-4), 0 0 0 3px var(--bre-accent-glow);
}

/* The last enabled key cannot be switched off; it stays lit but stands back, so
   the refusal is visible before the click rather than after it. */
.bre-keys-toggle:disabled .bre-keys-toggle-mark { opacity: 0.45; }

/* A switched-off key stays listed but reads as idle through its ink alone: the
   row is still workable, so nothing about it is made fainter than text. */
.bre-keys-row.is-off .bre-keys-alias,
.bre-keys-row.is-off .bre-keys-mask {
  opacity: 1;
  color: var(--bre-ink-4);
}

.bre-keys-alias {
  font-size: 12px;
  font-weight: 500;
  color: var(--bre-ink);
}

.bre-keys-mask {
  padding: 1px 6px;
  border-radius: var(--bre-r-xs);
  background: var(--bre-sunken);
  color: var(--bre-ink-3);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.bre-keys-mask-plain {
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--bre-ink);
  font-family: inherit;
  font-size: 12px;
}

/* The row's tray: the protocol and the model scope are STATE and stay on the
   row; the verbs appear on hover. The split is made here rather than in the
   markup — the tray stays mounted and only the VERBS inside it are taken out of
   the line, picked out by :not(.bre-keys-scope): the scope is a <button> too,
   but its label is a count, not an action.
   User item 2: they used to be kept in the line and painted away with opacity,
   to stop the row shifting under the pointer. On a row with no alias that left
   the two things that ARE always visible — the protocol pill and the scope
   count — held apart by the width of three invisible buttons, so a resting list
   read as scattered words. A verb that is not showing now takes no room: the
   state stays together at the row's right edge, and the three actions open in
   place on hover. The row keeps its own width either way (it is the list's
   column), so nothing outside the row moves. */
.bre-keys-actions {
  gap: 6px;
  opacity: 1;
  pointer-events: auto;
}

.bre-keys-actions .bre-link-button:not(.bre-keys-scope) {
  display: none;
}

.bre-keys-row:hover .bre-keys-actions .bre-link-button:not(.bre-keys-scope),
.bre-keys-row:focus-within .bre-keys-actions .bre-link-button:not(.bre-keys-scope) {
  display: inline-flex;
}

/* A row waiting on "confirm remove / cancel" must never hide its own question. */
.bre-keys-actions.is-confirming .bre-link-button {
  display: inline-flex;
  opacity: 1;
  pointer-events: auto;
}

@media (hover: none) {
  .bre-keys-actions .bre-link-button:not(.bre-keys-scope) {
    display: inline-flex;
    opacity: 1;
    pointer-events: auto;
  }
}

.bre-keys-protocol {
  height: 20px;
  padding: 0 5px;
  gap: 3px;
  border-radius: 5px;
  background: var(--bre-sunken);
  color: var(--bre-ink-2);
  font-size: 11px;
  line-height: 1;
}

.bre-keys-protocol:hover {
  background: var(--bre-sunken-2);
  color: var(--bre-ink);
}

.bre-keys-protocol[aria-expanded='true'] {
  background: var(--bre-accent-weak);
  color: var(--bre-accent-ink);
}

.bre-keys-protocol-caret { font-size: 11px; opacity: 0.6; }

.bre-keys-scope {
  color: var(--bre-ink-3);
  font-family: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

/* Verbs are quieter than state: ink-3 at rest, ink on hover, danger for the one
   that removes a key. */
.bre-keys-actions .bre-link-button {
  color: var(--bre-ink-3);
  font-size: 11.5px;
}

.bre-keys-actions .bre-link-button:hover { color: var(--bre-ink); }

.bre-keys-actions .bre-keys-danger { color: var(--bre-danger); }

.bre-keys-actions .bre-keys-danger:hover { color: var(--bre-danger); }

/* The inline form: a sunken panel inside the list, never a dialog. */
.bre-keys-form-row { padding: 0 0 8px; }

.bre-keys-form {
  gap: 8px;
  padding: 10px;
  border: none;
  border-radius: var(--bre-r-sm);
  background: var(--bre-sunken);
}

.bre-keys-form-fields { gap: 6px; }

.bre-keys-hint,
.bre-keys-note {
  margin: 0;
  color: var(--bre-ink-hint);
  font-size: 11px;
  line-height: 16px;
}

.bre-keys-form-actions { gap: 6px; }

.bre-keys-form-actions .bre-primary-button {
  height: 26px;
  border-radius: 6px;
  font-size: 12px;
}

/* The chips — the models a key serves, and the wire a new key pins: one shape
   for every choice set in the settings. Selected is a tint, never a tick (see
   the no-movement rule at the top of this block). */
.bre-keys-chips { gap: 6px; }

.bre-keys-chip {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--bre-line-3);
  border-radius: 999px;
  background: transparent;
  color: var(--bre-ink-2);
  font-size: 11.5px;
}

.bre-keys-chip:hover {
  border-color: var(--bre-line-4);
  color: var(--bre-ink);
}

.bre-keys-chip.is-selected {
  background: var(--bre-accent-weak);
  border-color: var(--bre-accent-line);
  color: var(--bre-accent-ink);
  font-weight: 500;
}

.bre-keys-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}

/* Adding a key is the list's last line: a dashed invitation, not a button that
   competes with the row actions. */
.bre-keys-add {
  height: 34px;
  border: 1px dashed var(--bre-line-3);
  border-radius: var(--bre-r-sm);
  color: var(--bre-ink-3);
  font-size: 12px;
}

.bre-keys-add:hover {
  border-color: var(--bre-line-4);
  background: var(--bre-sunken);
  color: var(--bre-ink);
}

/* The protocol menu: roomy rows, each naming a wire and saying what it signs.
   The one in force wears the accent tint; no tick, so the rows keep one width
   and the list cannot shuffle under the pointer. */
.bre-protocol-menu {
  padding: 6px;
  border: 1px solid var(--bre-line-1);
  border-radius: var(--bre-r-md);
  background: var(--bre-surface);
  box-shadow: var(--bre-shadow-pop);
}

.bre-protocol-menu-title {
  padding: 4px 8px 6px;
  color: var(--bre-ink-hint);
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.bre-protocol-option {
  gap: 8px;
  min-height: 52px;
  padding: 8px 10px;
  border-radius: var(--bre-r-sm);
}

.bre-protocol-option:hover { background: var(--bre-hover); }

.bre-protocol-option[aria-selected='true'],
.bre-protocol-option[aria-selected='true']:hover {
  background: var(--bre-accent-weak);
}

.bre-protocol-option-title {
  color: var(--bre-ink);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}

.bre-protocol-option[aria-selected='true'] .bre-protocol-option-title {
  color: var(--bre-accent-ink);
}

.bre-protocol-option-hint {
  color: var(--bre-ink-hint);
  font-size: 11.5px;
  line-height: 16px;
}

.bre-protocol-option[aria-selected='true'] .bre-protocol-option-hint {
  color: var(--bre-accent-ink);
  opacity: 0.78;
}

.bre-protocol-option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}

@media (prefers-reduced-motion: reduce) {
  .bre-editor-tab { transition: none; }
  .bre-key-eye { transition: none; }
  .bre-keys-actions, .bre-keys-add, .bre-keys-chip { transition: none; }
}

/* ---- 指纹检测页签 / the fingerprint tab pane ----------------------------

   A SEPARATE pane, never a field in the model row: the model grid keeps its
   five columns and its own meaning (one row = one configuration), while this
   page is one row per model of one provider's health check. Everything here
   is ours — the pane's root carries data-bre-fingerprint, which is the bit
   the tab pass reads to decide the tab exists at all. No overlays, no toasts,
   no progress bar: progress is the row badge and nothing else (m00702). */

.bre-fingerprint {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 2px;
  min-width: 0;
}

.bre-fp-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.bre-fp-head .grow,
.bre-fp-family .grow,
.bre-fp-row-head .grow { flex: 1 1 auto; min-width: 0; }

.bre-fp-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--bre-ink);
}
.bre-fp-count,
.bre-fp-evidence,
.bre-fp-k {
  font-size: 11px;
  color: var(--bre-ink-3);
}
/* The status line is a STATUS, not a progress bar — it reports how the last
   run came out and, while a batch is going, where it is. 既然是状态行，就
   不该比徽章更响。 */
.bre-fp-summary {
  font-size: 12px;
  color: var(--bre-ink-2);
}
.bre-fp-intro {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--bre-ink-3);
}
.bre-fp-error {
  margin: 0;
  font-size: 11px;
  color: var(--bre-danger);
}

/* One button for the whole provider. Quiet by default and quiet while it
   runs — it only greys out. 一个强调色只表达状态，而"正在跑"已经在徽章和
   状态行上说了两遍。 */
.bre-fp-all,
.bre-fp-action {
  appearance: none;
  height: 26px;
  padding: 0 11px;
  border: 1px solid var(--bre-line-3);
  border-radius: var(--bre-r-sm);
  background: var(--bre-surface);
  color: var(--bre-ink-2);
  font: inherit;
  font-size: 11.5px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--bre-t) var(--bre-ease);
}
.bre-fp-all:hover:not(:disabled),
.bre-fp-action:hover:not(:disabled) {
  border-color: var(--bre-line-4);
  color: var(--bre-ink);
}
.bre-fp-all:focus-visible,
.bre-fp-action:focus-visible {
  outline: none;
  border-color: var(--bre-accent);
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
/* The fold control is borderless, so its focus ring rides the model id. */
.bre-fp-fold:focus-visible {
  outline: none;
  border-radius: var(--bre-r-sm);
  box-shadow: 0 0 0 2px var(--bre-accent-glow);
}
.bre-fp-all:disabled,
.bre-fp-action:disabled { opacity: 0.55; cursor: default; }

.bre-fp-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bre-fp-row {
  border: 1px solid var(--bre-line-2);
  border-radius: var(--bre-r-md);
  background: var(--bre-surface);
  overflow: hidden;
}
.bre-fp-row-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 44px;
  padding: 6px 12px;
}
/* The result card's fold control: chevron + model id as ONE button, so the
   target is the label the user reads and the row keeps a keyboard path to its
   own result card. Quiet until hover — the chevron alone carries the state. */
.bre-fp-fold {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: -6px -4px -6px -8px;
  padding: 6px 4px 6px 8px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.bre-fp-fold:hover .bre-fp-model { color: var(--bre-accent); }
.bre-fp-chev { flex: none; color: var(--bre-ink-3); opacity: .7; }
.bre-fp-model {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--bre-ink);
  overflow-wrap: anywhere;
}

/* The badge is the ONLY place a verdict is painted. 19px, a 5px corner and a
   hairline stroke, so a column of them reads as one instrument. State is the
   colour; the words say which state. */
.bre-fp-badge {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 6px;
  border: 1px solid var(--bre-line-3);
  border-radius: 5px;
  background: var(--bre-surface);
  color: var(--bre-ink-3);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}
.bre-fp-badge.is-idle { color: var(--bre-ink-3); }
.bre-fp-badge.is-queued { color: var(--bre-ink-3); border-style: dashed; }
.bre-fp-badge.is-running {
  border-color: var(--bre-accent-line);
  background: var(--bre-accent-weak);
  color: var(--bre-accent-ink);
}
.bre-fp-badge.is-identified {
  border-color: var(--bre-accent-line);
  background: var(--bre-accent-weak);
  color: var(--bre-accent-ink);
}
.bre-fp-badge.is-doubtful { color: var(--bre-warn); border-color: var(--bre-warn); }
.bre-fp-badge.is-failed { color: var(--bre-danger); background: var(--bre-danger-weak); }

/* The result card: where the numbers came from, what they say, and what they
   cannot say. Sunken, so it reads as evidence under the row rather than as
   another row. */
.bre-fp-body {
  padding: 10px 12px 12px;
  background: var(--bre-sunken);
  border-top: 1px solid var(--bre-line-1);
}
.bre-fp-family {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.bre-fp-v {
  font-size: 12px;
  font-weight: 500;
  color: var(--bre-ink);
}
/* 逐题那一行：三颗药丸，紧贴「家族 / 相似度」下方（m00136）。
   Grammar is the badge's — 19px, 5px corner, 11px text, one hairline — so the
   result card reads as one instrument instead of a second design. Only the
   state changes colour, and the state is exactly three: counted (success),
   not counted (warn), early-stopped (muted, dashed, because nothing failed).

   一行就是一行（m00557）：三颗并排、不换行、不收缩，靠「Q1 312 · 计入」
   这种窄标签把宽度压回来；换行会让三题读成两张表。 */
.bre-fp-chals {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  min-width: 0;
  /* 药丸三颗合计约 320px，窄窗才用得上：宁可横向滚一点，也不让第三颗被
     .bre-fp-row 的 overflow:hidden 悄悄裁掉。 */
  overflow-x: auto;
  scrollbar-width: none;
}
.bre-fp-chal {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  height: 19px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.bre-fp-chal.is-counted {
  background: var(--bre-ok-weak);
  color: var(--bre-ok-ink);
}
.bre-fp-chal.is-rejected {
  background: var(--bre-warn-weak);
  color: var(--bre-warn);
}
.bre-fp-chal.is-skipped {
  border-color: var(--bre-line-3);
  border-style: dashed;
  background: transparent;
  color: var(--bre-ink-3);
}
.bre-fp-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.bre-fp-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bre-fp-bar-name {
  width: 132px;
  flex: 0 0 auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--bre-ink-2);
  overflow-wrap: anywhere;
}
/* The bar is a measurement, so it gets no colour of its own — only the top
   candidate is tinted. 一个强调色只表达状态，而"第一名"就是这里的结论。 */
.bre-fp-bar-fill {
  height: 6px;
  min-width: 2px;
  flex: 0 1 auto;
  border-radius: var(--bre-r-pill);
  background: var(--bre-line-3);
}
.bre-fp-bar-fill.is-top { background: var(--bre-accent); }
.bre-fp-bar-value {
  font-size: 11px;
  color: var(--bre-ink-3);
  font-variant-numeric: tabular-nums;
}
.bre-fp-note {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--bre-ink-3);
}
/* The timing line answers "why was this slow" in one muted sentence:
   a long first-token wait means thinking preamble, a low chars/s means
   provider throughput. Same voice as the note, one line, no numbers that
   pretend to be measurements they are not. */
.bre-fp-timing {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--bre-ink-3);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .bre-fp-all, .bre-fp-action { transition: none; }
}

/* ==== Composer library toggle (对话 / 生图) ====
   Pinned to the model switcher's LEFT by position, not by flow: the shell's
   trailing control row wraps on narrow composers, so an in-flow sibling landed
   on the line above the switcher, and moving the shell's trigger into a
   plugin-owned wrapper made React re-render it on every scan. The host is a
   fixed-position sibling placed against the trigger's measured rect, so no
   shell node and no shell style is touched. Two chips in one quiet track: the
   active one wears the plugin's accent tint, the other stays text-only, so the
   pair reads as one mode switch, not two buttons. */
/* ==== Generated-image card: the chrome under a generated-image reply ==== */
.bre-image-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  padding: 8px 10px;
  border: 1px solid var(--bre-line-2);
  border-radius: var(--bre-r-md);
  background: var(--dsw-alias-bg-elevated, #ffffff);
}
.bre-image-card-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.bre-image-card-name {
  font-size: 12.5px;
  line-height: 18px;
  color: var(--bre-ink-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bre-image-card-note {
  font-size: 11.5px;
  line-height: 16px;
  color: var(--bre-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bre-image-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.bre-image-card-btn {
  appearance: none;
  border: 1px solid var(--bre-line-2);
  border-radius: var(--bre-r-sm);
  padding: 3px 9px;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  color: var(--bre-ink-2);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.bre-image-card-btn:hover {
  color: var(--bre-ink-1);
  border-color: var(--bre-line-3);
  background: var(--bre-sunken-2);
}
.bre-image-card-btn:focus-visible {
  outline: 2px solid var(--bre-accent-line);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .bre-image-card-btn {
    transition: none;
  }
}


/* ==== Image-generation config (生图配置) ====
   The Models-page title-row button and the floating pane it opens. The pane's
   z-index clears the settings dialog's own opaque overlay (z-index 1000,
   styles.ts) — the same arithmetic the drop line above uses, kept at 1010 per
   the design so any host toast (1200) still lands above it. */
/* The host's title is a bare h2 (block, full-width); the seat needs a flex
   line to hold the right edge. Plugin-owned, removed with the seat. */
.bre-config-title-line {
  display: flex;
  align-items: center;
}
.bre-config-host {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  flex: none;
}
/* The seat is a ROUND, icon-only button (user request: 圆形按钮，只放图标，不要文字).
   Circle at the same 28px the host's own title-line controls use, so it reads
   as one of them rather than a labelled pill competing with the heading. The
   label is not rendered as a text node at all — it lives in the button's
   title/aria-label — hence the fixed square, centred glyph and zero padding. */
.bre-config-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--bre-line-2);
  border-radius: 50%;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  color: var(--bre-ink-2);
  font: inherit;
  line-height: 1;
  cursor: pointer;
  transition: background var(--bre-t) var(--bre-ease), color var(--bre-t) var(--bre-ease),
    border-color var(--bre-t) var(--bre-ease);
}
.bre-config-btn:hover {
  color: var(--bre-ink);
  border-color: var(--bre-line-3);
  background: var(--bre-hover);
}
.bre-config-btn:focus-visible {
  outline: none;
  border-color: var(--bre-accent);
  box-shadow: 0 0 0 3px var(--bre-accent-glow);
}
.bre-config-btn-icon { flex: none; display: block; }

.bre-config-backdrop {
  position: fixed;
  inset: 0;
  background: #00000066;
  z-index: 1010;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.bre-config-pane {
  width: min(560px, calc(100vw - 48px));
  max-height: min(640px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  border: 1px solid var(--bre-line-2);
  background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 18px 48px #00000038;
  overflow: hidden;
}
.bre-config-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--bre-line-1);
}
.bre-config-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--bre-ink-1);
}
.bre-config-close {
  margin-left: auto;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--bre-ink-3);
  font-size: 13px;
  cursor: pointer;
}
.bre-config-close:hover { background: var(--bre-accent-weak); color: var(--bre-ink-1); }
.bre-config-body {
  padding: 14px 16px;
  overflow-y: auto;
}
.bre-config-foot {
  padding: 8px 16px 12px;
  font-size: 11px;
  line-height: 16px;
  color: var(--bre-ink-3);
}
.bre-config-loading {
  padding: 18px 4px;
  font-size: 12.5px;
  color: var(--bre-ink-3);
}
/* The first paint of the pane: real structure, grey rows, no spinner wobble. */
.bre-config-loading-text {
  margin-bottom: 12px;
}
.bre-config-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bre-config-skeleton-row {
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--bre-line-1);
  background: linear-gradient(90deg, var(--bre-sunken-2) 0%, var(--bre-sunken-1) 50%, var(--bre-sunken-2) 100%);
  background-size: 200% 100%;
  animation: bre-config-shimmer 1.4s linear infinite;
}
@keyframes bre-config-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .bre-config-skeleton-row { animation: none; }
}

.bre-config-card-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}
.bre-config-card-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--bre-ink-1);
}
.bre-config-card-sub {
  font-size: 11.5px;
  color: var(--bre-ink-3);
}
.bre-config-notice {
  margin: 0 0 10px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--bre-accent-line);
  background: var(--bre-accent-weak);
  color: var(--bre-accent-ink);
  font-size: 12px;
  line-height: 17px;
  overflow-wrap: anywhere;
}

.bre-config-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: var(--bre-r-pill);
  border: 1px solid var(--bre-line-2);
  font-size: 11px;
  line-height: 16px;
  color: var(--bre-ink-3);
  white-space: nowrap;
}
.bre-config-badge-ok { color: #1c7c3c; border-color: #1c7c3c33; background: #1c7c3c0f; }
.bre-config-badge-bad { color: #b3261e; border-color: #b3261e33; background: #b3261e0f; }
.bre-config-badge-unknown { color: var(--bre-ink-3); }
.bre-config-badge-default { color: var(--bre-accent); border-color: var(--bre-accent-line); background: var(--bre-accent-weak); }

.bre-config-defaults {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--bre-ink-3);
}
.bre-config-select {
  border: 1px solid var(--bre-line-2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  color: var(--bre-ink-1);
  font: inherit;
  font-size: 12px;
  padding: 3px 6px;
  max-width: 128px;
}

/* The timeout cell of the defaults row: a select over five minute steps
   (5/10/15/30/60), milliseconds in defaults.timeoutMs. */
.bre-config-timeout {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 2px;
}
.bre-config-timeout .bre-config-select {
  max-width: none;
}

/* The default-model row under the params: one menu standing in for the old
   per-row radio, so the pick does not compete with each row's own controls. */
.bre-config-default-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--bre-ink-3);
}
.bre-config-default-label { flex: none; }
.bre-config-default-select {
  max-width: none;
  min-width: 160px;
  flex: 0 1 auto;
}
.bre-config-default-select:disabled { opacity: 0.6; cursor: default; }

.bre-config-rows {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--bre-line-1);
  border-radius: 10px;
  overflow: hidden;
}
.bre-config-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
}
.bre-config-row + .bre-config-row { border-top: 1px solid var(--bre-line-1); }
.bre-config-name { min-width: 0; flex: 1 1 auto; }
.bre-config-name-main {
  font-size: 12.5px;
  color: var(--bre-ink-1);
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-wrap: anywhere;
}
.bre-config-name-sub {
  margin-top: 1px;
  font-size: 11px;
  line-height: 15px;
  color: var(--bre-ink-3);
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-wrap: anywhere;
}
.bre-config-row-controls {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.bre-config-btn-ghost {
  border: 1px solid var(--bre-line-2);
  border-radius: 6px;
  background: none;
  color: var(--bre-ink-2);
  font: inherit;
  font-size: 11.5px;
  line-height: 17px;
  padding: 3px 9px;
  cursor: pointer;
  flex: none;
}
.bre-config-btn-ghost:hover { color: var(--bre-ink-1); border-color: var(--bre-line-3); }
.bre-config-btn-ghost:disabled { opacity: 0.55; cursor: default; }
.bre-config-btn-primary {
  border: none;
  border-radius: 6px;
  background: var(--dsw-alias-label-primary, #17181a);
  color: var(--dsw-alias-bg-elevated, #ffffff);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  padding: 5px 12px;
  cursor: pointer;
  flex: none;
}
.bre-config-btn-primary:disabled { opacity: 0.6; cursor: default; }

.bre-config-empty {
  border: 1px dashed var(--bre-line-3);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bre-config-empty-text { font-size: 12.5px; color: var(--bre-ink-2); }
.bre-config-empty-hint { font-size: 11.5px; color: var(--bre-ink-3); line-height: 16px; }
.bre-config-suspects {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.bre-config-suspect {
  border: 1px solid var(--bre-line-2);
  border-radius: var(--bre-r-pill);
  padding: 2px 9px;
  font-size: 11.5px;
  color: var(--bre-ink-2);
}

.bre-config-tool {
  margin-top: 14px;
  border-top: 1px solid var(--bre-line-1);
  padding-top: 12px;
}
.bre-config-tool-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: var(--bre-ink-1);
}
.bre-config-tool-name {
  margin-left: auto;
  font-family: var(--bre-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--bre-ink-2);
  background: var(--bre-line-1);
  border-radius: var(--bre-r-pill);
  padding: 1px 8px;
}
.bre-config-tool-status {
  margin-top: 6px;
  font-size: 11.5px;
  line-height: 16px;
  color: var(--bre-ink-3);
  overflow-wrap: anywhere;
}
.bre-config-tool-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.bre-config-tool-hint {
  margin-top: 8px;
  font-size: 11px;
  line-height: 16px;
  color: var(--bre-ink-3);
}

/* The conversation's generated-image card (keyed tool.call.toolview). */
.bre-image-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.bre-image-card-running {
  font-size: 12px;
  color: var(--bre-ink-3);
}
.bre-image-card-caption {
  font-size: 11px;
  line-height: 16px;
  color: var(--bre-ink-3);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

`
