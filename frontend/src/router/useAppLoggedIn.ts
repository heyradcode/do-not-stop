import { useAuth } from '@shared/core';

import { useDynamicContext } from '../contexts/dynamic';

/** JWT and/or Dynamic wallet session. */
export function useAppLoggedIn(): boolean {
  const { isAuthenticated } = useAuth();
  const { user, primaryWallet } = useDynamicContext();
  return Boolean(isAuthenticated || user || primaryWallet);
}
