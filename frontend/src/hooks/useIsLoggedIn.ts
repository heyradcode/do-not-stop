import { useAuth } from '@shared/core';

import { useDynamicContext } from '@contexts/dynamic';

/** True when the user has a JWT session and/or a connected Dynamic wallet. */
export const useIsLoggedIn = (): boolean  => {
    const { isAuthenticated } = useAuth();
    const { user, primaryWallet } = useDynamicContext();
    return Boolean(isAuthenticated || user || primaryWallet);
}
