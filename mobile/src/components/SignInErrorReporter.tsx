import { useEffect, useRef } from 'react';
import { useAuth } from '@shared/core';

import { describeSignInFailure } from '../utils/signInFailure';
import { useToast } from './ui/Toast';

/**
 * Reports a failed sign-in, once, wherever it was started from.
 *
 * Mounted once rather than wired into each button. Sign-in can begin from the connect
 * button, the account sheet or any `SessionGate`, and all three end in the same context
 * state, so three copies of this would only be three chances to word it differently.
 *
 * Renders nothing. It exists for the toast.
 */
export default function SignInErrorReporter() {
    const { signInError } = useAuth();
    const toast = useToast();
    const lastReported = useRef<string | null>(null);

    useEffect(() => {
        if (!signInError) {
            lastReported.current = null;
            return;
        }

        // Keyed by message: the same failure re-rendered must not stack toasts, while a
        // genuinely different second failure still gets reported.
        const key = signInError.message;
        if (key === lastReported.current) return;
        lastReported.current = key;

        const described = describeSignInFailure(signInError);
        if (!described) return;

        console.error('[sign-in]', signInError);
        toast.error(described.message);
    }, [signInError, toast]);

    return null;
}
