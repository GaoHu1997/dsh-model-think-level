/**
 * Compare-before-write DOM helpers.
 *
 * Every write in the injection layer goes through one of these. An unchanged
 * `setAttribute` still fires a mutation record, and the passes listen for
 * mutations on the whole panel, so a blind write would have the scan chasing
 * its own tail: mark → record → rescan → mark. Comparing first is what makes
 * a settled page produce no mutations at all.
 *
 * @module dsh-model-think-level/client/injection/dom
 */
/** setAttribute only when the value would change. */
export declare function setAttr(el: Element, name: string, value: string): void;
/** `hidden` is a property, not an attribute these passes can compare textually. */
export declare function setHidden(el: HTMLElement | undefined, hidden: boolean): void;
/** Class writes compare first, like {@link setAttr}. `classList.add` is a
 * no-op for a token it already holds in a spec-conforming engine, but it is
 * not one in jsdom — and this helper's promise ("a settled page writes
 * nothing") has to hold in both, since a write here feeds the same scan. */
export declare function setClass(el: HTMLElement, name: string, on: boolean): void;
/** Write text only when it differs, for the same reason as {@link setAttr}. */
export declare function setText(el: HTMLElement | undefined, text: string): void;
