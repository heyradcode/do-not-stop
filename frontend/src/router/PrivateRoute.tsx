import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@shared/core';

import { useDynamicContext } from '../contexts/dynamic';

/** JWT and/or Dynamic wallet session. */
export function useAppLoggedIn(): boolean {
  const { isAuthenticated } = useAuth();
  const { user, primaryWallet } = useDynamicContext();
  return Boolean(isAuthenticated || user || primaryWallet);
}

/**
 * Route guard: render wrapped children when logged in. The marketing site
 * (`website/` workspace) is a separate property — disconnecting the wallet
 * does not bounce users out of the app.
 */
export type PrivateRouteProps = {
  children?: React.ReactElement;
};

export function PrivateRoute({ children }: PrivateRouteProps) {
  const isLoggedIn = useAppLoggedIn();

  if (!isLoggedIn) {
    return null;
  }
  return children ?? <Outlet />;
}
