import type { ReactNode } from 'react';
export interface SliderToggleProps {
    /** Localized copy (the plugin's bound translator). */
    t: (key: string, params?: Record<string, string | number>) => string;
}
/** One boxed setting row: label copy (upstream .re-setting-row form), live state, and the switch. */
export declare function SliderToggle(props: SliderToggleProps): ReactNode;
