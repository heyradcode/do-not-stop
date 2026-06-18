import React, { useEffect, useRef, useState } from 'react';
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
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { results, isLoading } = useSearchPets(inputText, {
        chain,
        enabled: open && !selected,
    });

    const filtered = excludeIds.length
        ? results.filter((p) => !excludeIds.includes(p.id))
        : results;

    // When parent clears value externally, reset local state.
    useEffect(() => {
        if (!value) {
            setSelected(null);
            setInputText('');
        }
    }, [value]);

    // Close dropdown on outside click.
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

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
        setOpen(v.trim().length > 0);
        setActiveIdx(-1);
    };

    const handleFocus = () => {
        if (!selected && inputText.trim().length > 0) setOpen(true);
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

    return (
        <div ref={wrapperRef} className={`pet-search-dropdown${disabled ? ' disabled' : ''}`}>
            <div className={`psd-input-wrap${isSelected ? ' is-selected' : ''}${open ? ' is-open' : ''}`}>
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
                    <span className="psd-selected-badge">#{selected.id} · Lv {selected.level}</span>
                )}
                {isSelected ? (
                    <button type="button" className="psd-clear" onClick={handleClear} aria-label="Clear selection">
                        ✕
                    </button>
                ) : (
                    <span className={`psd-chevron${open ? ' up' : ''}`} aria-hidden>▾</span>
                )}
            </div>

            {open && (
                <div className="psd-dropdown" role="listbox">
                    {isLoading && (
                        <div className="psd-state-row">Searching…</div>
                    )}
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
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(pet); }}
                        >
                            <span className="psd-row-name">{pet.name}</span>
                            <span className="psd-row-id">#{pet.id}</span>
                            <span className="psd-row-level">Lv {pet.level}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PetSearchDropdown;
