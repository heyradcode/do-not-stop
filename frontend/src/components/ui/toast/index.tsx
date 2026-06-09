import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Icon, { CheckIcon, CloseIcon, PauseIcon, WarningIcon } from '@components/ui/icon';
import { Tones, type Tone } from '@constants/tones';
import './index.css';

export type ToastTone = 'error' | 'info' | 'success';

export type ToastInput = {
    message: string;
    tone?: ToastTone;
};

type ToastRecord = ToastInput & {
    id: string;
};

type ToastContextValue = {
    show: (input: ToastInput) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    success: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5200;

function toneIcon(tone: ToastTone) {
    if (tone === 'success') return CheckIcon;
    if (tone === 'info') return PauseIcon;
    return tone === 'error' ? CloseIcon : WarningIcon;
}

function toneColor(tone: ToastTone): Exclude<Tone, 'azure'> {
    if (tone === 'success') return Tones.Emerald;
    if (tone === 'info') return Tones.Inherit;
    return Tones.Magenta;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastRecord[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const show = useCallback(
        ({ message, tone = 'error' }: ToastInput) => {
            const id = crypto.randomUUID();
            setToasts((current) => [...current, { id, message, tone }]);
            window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
        },
        [dismiss],
    );

    const value = useMemo<ToastContextValue>(
        () => ({
            show,
            error: (message) => show({ message, tone: 'error' }),
            info: (message) => show({ message, tone: 'info' }),
            success: (message) => show({ message, tone: 'success' }),
        }),
        [show],
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
                {toasts.map((toast) => {
                    const IconComponent = toneIcon(toast.tone ?? 'error');
                    return (
                        <div
                            key={toast.id}
                            className={`toast toast-${toast.tone ?? 'error'}`}
                            role="status"
                        >
                            <span className="icon" aria-hidden>
                                <Icon as={IconComponent} tone={toneColor(toast.tone ?? 'error')} />
                            </span>
                            <p className="message">{toast.message}</p>
                            <button
                                type="button"
                                className="dismiss"
                                aria-label="Dismiss notification"
                                onClick={() => dismiss(toast.id)}
                            >
                                ×
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};

export function useToast(): ToastContextValue {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}
