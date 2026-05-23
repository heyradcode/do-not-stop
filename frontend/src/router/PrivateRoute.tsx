import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@shared/core';

import { useDynamicContext } from '../contexts/dynamic';

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'http://localhost:3002';

/** JWT and/or Dynamic wallet session. */
export function useAppLoggedIn(): boolean {
  const { isAuthenticated } = useAuth();
  const { user, primaryWallet } = useDynamicContext();
  return Boolean(isAuthenticated || user || primaryWallet);
}

/**
 * Route guard: render wrapped children when logged in, otherwise redirect to the
 * external marketing website (now hosted in the `website/` workspace).
 */
export type PrivateRouteProps = {
  children?: React.ReactElement;
};

export function PrivateRoute({ children }: PrivateRouteProps) {
  const isLoggedIn = useAppLoggedIn();

  useEffect(() => {
    if (!isLoggedIn) {
      window.location.replace(WEBSITE_URL);
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return null;
  }
  return children ?? <Outlet />;
}
