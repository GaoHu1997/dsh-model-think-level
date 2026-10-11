/**
 * Foreign React roots mounted into the official shell's DOM.
 *
 * This plugin never becomes part of the host's React tree: it renders its own
 * roots into elements it inserts itself. These helpers are the whole of that
 * mechanism, plus the render-failure boundary that keeps a throwing subtree
 * from leaving an empty root behind.
 *
 * @module dsh-model-think-level/client/injection/mount
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { type Root } from 'react-dom/client';
/**
 * The root this plugin scans. The official models page can live anywhere in
 * the settings surface (a hash-classed panel, a dialog, a portal), so guessing
 * a container is fragile — and the injector is idempotent and cheap, so
 * scanning the whole document is both safe and correct.
 */
export declare function panelRoot(): HTMLElement;
/** One foreign React root this plugin created, with the element holding it. */
export interface ForeignMount {
    wrapper: HTMLElement;
    root: Root;
}
/** Options of {@link mountReact}. */
export interface MountOptions {
    /**
     * Commit the subtree before returning (React's `flushSync`).
     *
     * REQUIRED for roots whose height the official model card measures: a root
     * that commits one frame later makes the card grow across frames, so its
     * anchored position is visible at the wrong height for at least one paint.
     */
    sync?: boolean;
}
/** Create a React root inside `container` and render `children` into it. */
export declare function mountReact(container: HTMLElement, children: ReactNode, options?: MountOptions): ForeignMount;
/**
 * Unmount a foreign root and detach its wrapper.
 *
 * `root.unmount()` runs the subtree's passive cleanups synchronously, so a
 * component that restored DOM on cleanup (the search filter) has done so by
 * the time the wrapper leaves the document.
 */
export declare function unmountReact(mount: ForeignMount | undefined): void;
/** Render-failure boundary: surfaces the cause instead of an empty root. */
export declare class EffortBoundary extends Component<{
    children?: ReactNode;
    fallbackText: string;
}, {
    error: string | null;
}> {
    state: {
        error: string | null;
    };
    static getDerivedStateFromError(error: unknown): {
        error: string;
    };
    componentDidCatch(error: unknown, info: ErrorInfo): void;
    render(): ReactNode;
}
