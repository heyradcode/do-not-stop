import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { Pet } from '@shared/core';

import PetArt from '@components/pet/pet-art';
import styles from './index.module.css';

export type PetSelectOption = {
    id: string;
    pet: Pet;
};

export type PetSelectProps = {
    /** Pets to choose from, in display order. */
    pets: PetSelectOption[];
    /** Selected pet id, or '' for none. */
    value: string;
    onChange: (petId: string) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Forwarded to the trigger so an external `<label htmlFor>` targets it. */
    id?: string;
    /** Names the control when there is no visible `<label>` to point at it. */
    label?: string;
    /** Accent colour, e.g. `var(--cp-magenta)`. Defaults to the panels' cyan. */
    accent?: string;
};

/**
 * Dropdown over a fixed list of pets, showing each one's art.
 *
 * A native `<select>` cannot show a pet — `<option>` renders text and almost nothing
 * else, and its popup is drawn by the operating system, so it arrives in the middle of a
 * neon panel looking like a settings dialog. This is the same list rendered as real
 * elements: each row carries the pet's art, name and level.
 *
 * Distinct from `PetSearchDropdown`, which queries the backend for *other* players' pets
 * by name. This one takes a list it is given and never searches, so it suits the battle
 * arena's two sides: the player's ready fighters, and the matchmade opponents.
 *
 * Where a panel has the room to lay pets out instead, `PetPicker` does that — visible
 * tiles beat a menu when nothing is competing for the space.
 *
 * The popup is portalled to `document.body` and positioned from the trigger's rect: the
 * panels that host it set `overflow: hidden` on their bodies to scroll internally, and an
 * in-flow popup would be clipped by that.
 */
const PetSelect: React.FC<PetSelectProps> = ({
    pets,
    value,
    onChange,
    placeholder = 'Select pet…',
    disabled = false,
    id,
    label,
    accent,
}) => {
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    const accentStyle = useMemo(
        () => (accent ? ({ '--ps-accent': accent } as React.CSSProperties) : undefined),
        [accent],
    );

    const selectedIdx = useMemo(() => pets.findIndex((p) => p.id === value), [pets, value]);
    const selected = selectedIdx >= 0 ? pets[selectedIdx] : undefined;

    // Measured and opened in one commit, so the popup never renders a frame at the
    // wrong position.
    const openPopup = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPopupStyle({
            position: 'fixed',
            top: rect.bottom + 6,
            left: rect.left,
            width: rect.width,
            zIndex: 9999,
        });
        setActiveIdx(selectedIdx >= 0 ? selectedIdx : 0);
        setOpen(true);
    }, [selectedIdx]);

    const close = useCallback(() => {
        setOpen(false);
        setActiveIdx(-1);
    }, []);

    const choose = useCallback(
        (petId: string) => {
            onChange(petId);
            close();
            triggerRef.current?.focus();
        },
        [onChange, close],
    );

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
            close();
        };
        // Closed rather than repositioned on scroll: the popup is fixed to a rect
        // measured once, so a scrolled panel would leave it floating beside nothing.
        // `true` catches scrolls on the panel body, which does not bubble.
        const onScrollOrResize = () => close();

        document.addEventListener('mousedown', onPointerDown);
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    }, [open, close]);

    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!open) {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPopup();
            }
            return;
        }
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, pets.length - 1));
                break;
            case 'ArrowUp':
                event.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
                break;
            case 'Home':
                event.preventDefault();
                setActiveIdx(0);
                break;
            case 'End':
                event.preventDefault();
                setActiveIdx(pets.length - 1);
                break;
            case 'Enter':
            case ' ': {
                event.preventDefault();
                const option = pets[activeIdx];
                if (option) choose(option.id);
                break;
            }
            case 'Escape':
                event.preventDefault();
                close();
                break;
            case 'Tab':
                close();
                break;
            default:
                break;
        }
    };

    const popup =
        open && popupStyle
            ? createPortal(
                  <div
                      ref={popupRef}
                      className={styles.popup}
                      style={{ ...popupStyle, ...accentStyle }}
                      role="listbox"
                      id={id ? `${id}-listbox` : undefined}
                  >
                      {pets.length === 0 ? (
                          <div className={styles.emptyRow}>No pets available</div>
                      ) : (
                          pets.map((option, index) => (
                              <button
                                  key={option.id}
                                  type="button"
                                  role="option"
                                  id={id ? `${id}-option-${option.id}` : undefined}
                                  aria-selected={option.id === value}
                                  className={clsx(
                                      styles.row,
                                      index === activeIdx && styles.isActive,
                                      option.id === value && styles.isSelected,
                                  )}
                                  // mousedown, not click: the trigger would otherwise
                                  // blur and close the popup before the click lands.
                                  onMouseDown={(event) => {
                                      event.preventDefault();
                                      choose(option.id);
                                  }}
                                  onMouseEnter={() => setActiveIdx(index)}
                              >
                                  <span className={styles.rowArt} aria-hidden>
                                      <PetArt pet={option.pet} />
                                  </span>
                                  <span className={styles.rowName}>{option.pet.name}</span>
                                  <span className={styles.rowLevel}>Lv {option.pet.level}</span>
                              </button>
                          ))
                      )}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                className={clsx(styles.trigger, open && styles.isOpen, disabled && styles.disabled)}
                style={accentStyle}
                disabled={disabled}
                onClick={() => (open ? close() : openPopup())}
                onKeyDown={onKeyDown}
                role="combobox"
                aria-label={label}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={id ? `${id}-listbox` : undefined}
            >
                {selected ? (
                    <>
                        <span className={styles.triggerArt} aria-hidden>
                            <PetArt pet={selected.pet} />
                        </span>
                        <span className={styles.triggerName}>{selected.pet.name}</span>
                        <span className={styles.rowLevel}>Lv {selected.pet.level}</span>
                    </>
                ) : (
                    <span className={styles.placeholder}>{placeholder}</span>
                )}
                <span className={styles.chevron} aria-hidden />
            </button>
            {popup}
        </>
    );
};

export default PetSelect;
