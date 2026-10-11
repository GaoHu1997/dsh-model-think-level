import type { ReactNode } from 'react';
/** The slice of the shell's locale service this component consumes. */
export interface LocaleFace {
    /** Notified on every snapshot change (language switch or registration). */
    subscribe(fn: () => void): () => void;
    /** Current snapshot; `revision` moves on every change. */
    getSnapshot(): {
        revision?: number;
    };
}
export interface LocaleRefreshProps {
    /** The shell's locale service, acting as its own LocaleFace. */
    locale: LocaleFace;
    /** Rebuilt on every render — see the module docblock. */
    children: () => ReactNode;
}
/** Re-render {@link LocaleRefreshProps.children} on every locale revision bump. */
export declare function LocaleRefresh(props: LocaleRefreshProps): ReactNode;
