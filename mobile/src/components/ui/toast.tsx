import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { neon, neonGlow } from '../../theme/neon';

/**
 * RN equivalent of `frontend/src/components/ui/toast`. The context value is the
 * same shape on purpose, so `useNotifyError`, `usePetErrorToast` and
 * `useTxErrorToast` port across unchanged.
 *
 * Rendered as an absolutely positioned overlay rather than a portal, since RN has
 * no document to portal into. It sits outside `SafeAreaProvider` (matching
 * frontend's provider order, where `ToastProvider` wraps the router), so the
 * bottom offset is a fixed inset rather than a measured one.
 */
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

const TONE_COLOR: Record<ToastTone, string> = {
    error: neon.danger,
    info: neon.cyan,
    success: neon.success,
};

/** Stands in for `crypto.randomUUID`, which RN does not provide. */
let nextToastId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastRecord[]>([]);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const show = useCallback(
        ({ message, tone = 'error' }: ToastInput) => {
            const id = String(++nextToastId);
            setToasts((current) => [...current, { id, message, tone }]);
            timersRef.current.push(setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
        },
        [dismiss],
    );

    // A pending timer fires into an unmounted provider on a fast reload otherwise.
    useEffect(
        () => () => {
            timersRef.current.forEach(clearTimeout);
            timersRef.current = [];
        },
        [],
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
            {toasts.length > 0 && (
                <View style={styles.viewport} pointerEvents="box-none">
                    {toasts.map((toast) => {
                        const color = TONE_COLOR[toast.tone ?? 'error'];
                        return (
                            <View
                                key={toast.id}
                                accessibilityLiveRegion="polite"
                                style={[styles.toast, { borderColor: color }, neonGlow(color, 10, 0.35)]}
                            >
                                <Text style={[styles.message, { color: neon.text }]}>{toast.message}</Text>
                                <Pressable
                                    onPress={() => dismiss(toast.id)}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel="Dismiss notification"
                                >
                                    <Text style={[styles.dismiss, { color }]}>×</Text>
                                </Pressable>
                            </View>
                        );
                    })}
                </View>
            )}
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastContextValue => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

const styles = StyleSheet.create({
    viewport: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 32,
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: neon.bgPanel,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginTop: 8,
    },
    message: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
    dismiss: {
        fontSize: 22,
        fontWeight: '700',
        marginLeft: 12,
    },
});
