import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchPets } from '@shared/core';
import type { OpponentPet, PetChain } from '@shared/core';
import './index.css';

export type PetSearchDropdownProps = {
    chain: PetChain | null;
    value: string;
    onChange: (petId: string) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Pet IDs to exclude from results (e.g. the user's own pets). */
    excludeIds?: string[];
};

const PetSearchDropdown: React.FC<PetSearchDropdownProps> = ({
    chain,
    value,
    onChange,
    placeholder = 'Search by name or ID…',
    disabled = false,
    excludeIds = [],
}) => {
    const [inputText, setInputText] = useState('');
    const [selected, setSelected] = useState<OpponentPet | null>(null);
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { results, isLoading } = useSearchPets(inputText, {
        chain,
        enabled: open && !selected,
    });

    const filtered = excludeIds.length
        ? results.filter((p) => !excludeIds.includes(p.id))
        : results;

    // Measure wrapper position and open the dropdown atomically so the portal
    // renders in the same commit that open becomes true (avoids the blank frame
    // that occurs when dropdownStyle is set in a separate useLayoutEffect).
    const openDropdown = useCallback(() => {
        if (!wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        setDropdownStyle({
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            zIndex: 9999,
        });
        setOpen(true);
    }, []);

    // When parent clears value externally, reset local state.
    useEffect(() => {
        if (!value) {
            setSelected(null);
            setInputText('');
        }
    }, [value]);

    // Close dropdown on outside click (check both wrapper and the portal div).
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const inWrapper = wrapperRef.current?.contains(target) ?? false;
            const inDropdown = dropdownRef.current?.contains(target) ?? false;
            if (!inWrapper && !inDropdown) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Close on scroll/resize only for events outside the dropdown itself —
    // scrolling through the results list should not close it.
    useEffect(() => {
        if (!open) return;
        const close = (e: Event) => {
            if (dropdownRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        window.addEventListener('scroll', close, { capture: true, passive: true });
        window.addEventListener('resize', close, { passive: true });
        return () => {
            window.removeEventListener('scroll', close, { capture: true });
            window.removeEventListener('resize', close);
        };
    }, [open]);

    // Reset active row when results change.
    useEffect(() => {
        setActiveIdx(-1);
    }, [filtered.length]);

    const handleSelect = (pet: OpponentPet) => {
        setSelected(pet);
        setInputText(pet.name);
        setOpen(false);
        setActiveIdx(-1);
        onChange(pet.id);
    };

    const handleClear = () => {
        setSelected(null);
        setInputText('');
        setOpen(false);
        onChange('');
        inputRef.current?.focus();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setInputText(v);
        if (selected) {
            setSelected(null);
            onChange('');
        }
        if (v.trim().length > 0) {
            openDropdown();
        } else {
            setOpen(false);
        }
        setActiveIdx(-1);
    };

    const handleFocus = () => {
        if (!selected && inputText.trim().length > 0) openDropdown();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && activeIdx >= 0 && filtered[activeIdx]) {
            e.preventDefault();
            handleSelect(filtered[activeIdx]);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    const isSelected = selected !== null;

    const dropdownPortal =
        open && dropdownStyle
            ? createPortal(
                  <div
                      ref={dropdownRef}
                      className="psd-dropdown"
                      role="listbox"
                      style={dropdownStyle}
                  >
                      {isLoading && <div className="psd-state-row">Searching…</div>}
                      {!isLoading && filtered.length === 0 && inputText.trim() && (
                          <div className="psd-state-row">No pets found</div>
                      )}
                      {filtered.map((pet, i) => (
                          <button
                              key={pet.id}
                              type="button"
                              role="option"
                              aria-selected={i === activeIdx}
                              className={`psd-row${i === activeIdx ? ' active' : ''}`}
                              onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelect(pet);
                              }}
                          >
                              <span className="psd-row-name">{pet.name}</span>
                              <span className="psd-row-id">#{pet.id}</span>
                              <span className="psd-row-level">Lv {pet.level}</span>
                          </button>
                      ))}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <div ref={wrapperRef} className={`pet-search-dropdown${disabled ? ' disabled' : ''}`}>
            <div
                className={`psd-input-wrap${isSelected ? ' is-selected' : ''}${
                    open ? ' is-open' : ''
                }`}
            >
                <input
                    ref={inputRef}
                    type="text"
                    className="psd-input"
                    value={inputText}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    spellCheck={false}
                />
                {isSelected && (
                    <span className="psd-selected-badge">
                        #{selected.id} · Lv {selected.level}
                    </span>
                )}
                {isSelected ? (
                    <button
                        type="button"
                        className="psd-clear"
                        onClick={handleClear}
                        aria-label="Clear selection"
                    >
                        ✕
                    </button>
                ) : (
                    <span className={`psd-chevron${open ? ' up' : ''}`} aria-hidden>
                        ▾
                    </span>
                )}
            </div>

            {dropdownPortal}
        </div>
    );
};

export default PetSearchDropdown;
