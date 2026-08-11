import clsx from 'clsx';
import { type Tone } from '@constants/tones';
import styles from './index.module.css';

/**
 * A two-or-more-way switch between views of the same screen, styled as one segmented
 * control rather than a row of buttons.
 *
 * Extracted because three screens had grown their own copy — battle, leaderboard, inventory —
 * with identical markup and stylesheets that differed only in the accent `rgb()`. The look
 * was the problem the extraction was asked to fix, and three copies is three places to fix
 * it, so the shape moved here at the same time.
 *
 * Not a router. Each caller keeps its own state and decides what a switch costs: the battle
 * page unmounts the panel it leaves, the leaderboard resets its page number. Those are
 * per-screen decisions and folding them in here would make the control opinionated about
 * things it cannot see.
 */

export type TabSwitchTone = Extract<Tone, 'magenta' | 'amber' | 'cyan' | 'violet' | 'emerald'>;

export interface TabSwitchOption<Id extends string> {
    id: Id;
    label: string;
}

export interface TabSwitchProps<Id extends string> {
    /** Rendered left to right, in the order given. */
    options: readonly TabSwitchOption<Id>[];
    value: Id;
    /**
     * `NoInfer` so `Id` is fixed by `options` alone. Without it a caller passing a
     * `useState` setter straight in contributes its own candidate, `Id` widens to `string`,
     * and the setter stops accepting it — an error at the call site about a type the call
     * site never wrote.
     */
    onChange(next: NoInfer<Id>): void;
    /** Names the group for a screen reader — the control has no visible heading. */
    label: string;
    tone?: TabSwitchTone;
    className?: string;
}

const TONE_CLASS: Record<TabSwitchTone, string> = {
    magenta: styles.magenta,
    amber: styles.amber,
    cyan: styles.cyan,
    violet: styles.violet,
    emerald: styles.emerald,
};

function TabSwitch<Id extends string>({
    options,
    value,
    onChange,
    label,
    tone = 'cyan',
    className,
}: TabSwitchProps<Id>) {
    return (
        <div className={clsx(styles.track, TONE_CLASS[tone], className)} role="tablist" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={value === option.id}
                    className={clsx(styles.tab, value === option.id && styles.isActive)}
                    onClick={() => onChange(option.id)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export default TabSwitch;
