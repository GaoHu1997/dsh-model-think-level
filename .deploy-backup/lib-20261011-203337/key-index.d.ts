/**
 * The provider key index: plugin-owned metadata about the keys configured for
 * one provider route.
 *
 * The harness stores VALUES only: `<DSH_HOME>/.credentials.yaml` holds one value
 * per reference, the service reports `{configured, source, writable}` and never
 * the value, and there is no enumeration API at all. A list of "the keys this
 * provider has", each with a human label, therefore cannot live in the harness
 * — it is plugin state. It is kept here, beside the harness home rather than
 * inside the pi-ai profile, because the official add-provider card writes the
 * WHOLE profile at `providers.<route>` and an unknown sibling key there would
 * be at the mercy of schema validation.
 *
 * The file holds no secrets: references and labels only, which is what makes it
 * safe to keep in plain text and easy for a user to inspect or repair by hand.
 * Every read is defensive (a corrupted file degrades to "nothing listed") and
 * every write is atomic (`write` to a sibling temp file, then `rename`), so a
 * crash mid-write cannot leave a half-parsed index behind.
 *
 * All of it is synchronous on purpose: the host is single-threaded, so a
 * read-modify-write inside one request handler cannot interleave with another
 * request's, which is the whole concurrency story this file needs.
 *
 * @module dsh-model-think-level/key-index
 */
import { type KeyEntry } from './key-refs.js';
/** One route's entry, re-exported so the host half has a single import site. */
export type KeyIndexEntry = KeyEntry;
/** The whole index document, exactly as it sits on disk. */
export interface KeyIndexDocument {
    /** Schema version; a future shape can migrate by reading this. */
    readonly version: 1;
    /** Route → keys, in the order the manager lists them. */
    readonly providers: Record<string, readonly KeyIndexEntry[]>;
}
/** A fresh, empty index. */
export declare function emptyKeyIndex(): KeyIndexDocument;
/**
 * The harness home: `$DSH_HOME` when the host exports it, else the `~/.dsh`
 * the harness would have defaulted to. Never throws.
 */
export declare function harnessHome(): string;
/** Absolute path of the plugin's key index. */
export declare function keyIndexFilePath(home?: string): string;
/**
 * Parse an already-decoded index document. Never throws and never trusts the
 * input: anything unrecognisable is dropped entry by entry, so a hand-edited or
 * truncated file costs at most the lines it got wrong.
 * @param raw - the decoded JSON value (or anything else).
 * @returns a well-formed document.
 */
export declare function parseKeyIndex(raw: unknown): KeyIndexDocument;
/** Read the index at one path, or an empty one when there is nothing to read. */
export declare function readKeyIndex(file?: string): KeyIndexDocument;
/** Write the index at one path, atomically. */
export declare function writeKeyIndex(document: KeyIndexDocument, file?: string): void;
/**
 * One synchronous read-modify-write. The returned document is what was stored.
 * @param mutate - pure document transform.
 * @param file - index path (tests pass a temp file).
 */
export declare function updateKeyIndex(mutate: (document: KeyIndexDocument) => KeyIndexDocument, file?: string): KeyIndexDocument;
/** One route's keys, or an empty list. */
export declare function keyEntriesOf(document: KeyIndexDocument, route: string): readonly KeyIndexEntry[];
/** Whether one route's list names this reference. */
export declare function hasKeyEntry(document: KeyIndexDocument, route: string, ref: string): boolean;
/**
 * Add a key, or relabel the one already there. Order is preserved: the list is
 * what the panel renders, and a key that moves on every rename is a worse list.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 * @param alias - a label, or undefined to keep whatever is stored.
 */
export declare function withKeyEntry(document: KeyIndexDocument, route: string, ref: string, alias?: string | undefined): KeyIndexDocument;
/**
 * Set (or clear) one key's label.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference; a no-op when it is not listed.
 * @param alias - the new label, or undefined to fall back to the reference.
 */
export declare function withKeyAlias(document: KeyIndexDocument, route: string, ref: string, alias: string | undefined): KeyIndexDocument;
/**
 * Drop one key. The route key itself is removed once its list empties, so a
 * provider the user cleaned up leaves no residue in the file.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference to forget.
 */
export declare function withoutKeyEntry(document: KeyIndexDocument, route: string, ref: string): KeyIndexDocument;
