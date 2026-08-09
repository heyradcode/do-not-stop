import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './index.module.css';

/**
 * A "?" button that opens a short explanation.
 *
 * A disclosure, not a hover tooltip. Hover has no touch equivalent and cannot be reached by
 * keyboard, and this content answers a question ("what does this actually do?") rather than
 * labelling a control — so it opens on click, closes on Escape or an outside click, and is
 * announced through `aria-expanded` / `aria-controls` like any other disclosure.
 *
 * The panel is portalled to `document.body` and positioned `fixed`. That is not decoration:
 * the item card sets `overflow: hidden` to keep its rarity stripe inside its rounded corner,
 * so a panel rendered in place would be clipped to the card and mostly invisible. Portalling
 * escapes the clip; `fixed` then keeps it aligned to the button without needing every
 * ancestor to be a positioning context.
 *
 * It closes rather than follows on scroll. A fixed panel anchored to coordinates taken once
 * drifts away from its button as the page moves, and recomputing on every scroll frame is a
 * lot of machinery for a panel whose natural lifetime is "read it, dismiss it".
 */

export type InfoTooltipProps = {
    /** Names what is being explained, e.g. "Iron Fang". Used to label the button. */
    subject: string;
    children: React.ReactNode;
};

/** Keeps the panel inside the viewport with a small margin. */
const MARGIN = 8;
const PANEL_WIDTH = 264;

const InfoTooltip: React.FC<InfoTooltipProps> = ({ subject, children }) => {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = useId();

    // Before paint, so the panel never shows at a stale position for a frame.
    useLayoutEffect(() => {
        if (!open || !buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const left = Math.min(
            Math.max(MARGIN, rect.left + rect.width / 2 - PANEL_WIDTH / 2),
            window.innerWidth - PANEL_WIDTH - MARGIN,
        );
        setPosition({ top: rect.bottom + 6, left });
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            // Focus goes back to the trigger, or a keyboard user is left at the top of the
            // document having dismissed something they cannot see.
            buttonRef.current?.focus();
        };
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onScroll = () => setOpen(false);

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        // Capture: a scroll inside the bag's own scrolling region does not bubble to window.
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [open]);

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className={styles.trigger}
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                aria-label={`What does ${subject} do?`}
                onClick={() => setOpen((current) => !current)}
            >
                {/* A typographic "?" rather than an icon glyph. At this size a drawn question
                    mark is mush, while the typeface already has one designed to be read
                    small. `aria-hidden` because the button's own label already says what it
                    does — a screen reader announcing "question mark" adds nothing. */}
                <span className={styles.glyph} aria-hidden>
                    ?
                </span>
            </button>
            {open && position
                ? createPortal(
                    <div
                        ref={panelRef}
                        id={panelId}
                        className={styles.panel}
                        style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
                    >
                        <p className={styles.subject}>{subject}</p>
                        <div className={styles.body}>{children}</div>
                    </div>,
                    document.body,
                )
                : null}
        </>
    );
};

export default InfoTooltip;
