import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

import { useNonce, useVerifySignature } from '../hooks/useAuth';
import { useUserProfile } from '../hooks/useUserProfile';

interface User {
  address: string;
  createdAt: string;
  lastLogin: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  logout: () => void;
  signAndLogin: () => Promise<void>;
  isSigning: boolean;
  isVerifying: boolean;
  isNonceLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { address, isConnected, chainId } = useAccount();
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [pendingNonce, setPendingNonce] = useState<string | null>(null);

  // React Query hooks
  const { refetch: getNonce, isLoading: isNonceLoading } = useNonce();
  const { mutate: verifySignature, isPending: isVerifying, data: authData, error: verifyError } = useVerifySignature();
  const { data: userProfile, error: profileError } = useUserProfile();
  const { signMessage, isPending: isSigning, data: signature, error: signError } = useSignMessage();

  useEffect(() => {
    const isWalletConnected = isConnected && !!address;

    // If wallet is disconnected, clear authentication state and token
    if (!isWalletConnected) {
      setAuthenticated(false);
      setUser(null);
      localStorage.removeItem('authToken');
      return;
    }

    // If we have both token and wallet connection, the useUserProfile hook will automatically run
    // and validate the token by fetching the user profile
  }, [address, isConnected]);

  // Handle user profile success (token is valid)
  useEffect(() => {
    if (userProfile?.success) {
      setAuthenticated(true);
      setUser(userProfile.user);
    }
  }, [userProfile]);

  // Handle user profile failure (token is invalid/expired)
  useEffect(() => {
    if (profileError) {
      console.error('Profile fetch failed:', profileError);
      setAuthenticated(false);
      setUser(null);
      // Token is already cleared by useUserProfile hook on 401
    }
  }, [profileError]);

  // Handle signature completion
  useEffect(() => {
    if (signature && pendingNonce && address && chainId) {
      verifySignature({
        address,
        signature,
        nonce: pendingNonce,
        chainId,
      });
    }
  }, [signature, pendingNonce, address, chainId, verifySignature]);

  // Handle authentication success
  useEffect(() => {
    if (authData?.success) {
      setAuthenticated(true);
      setUser(authData.user);
      setPendingNonce(null);
      console.log('Authentication successful:', authData);
    }
  }, [authData]);

  // Handle verification errors
  useEffect(() => {
    if (verifyError) {
      console.error('Verification error:', verifyError);
      setPendingNonce(null);
      alert(`Authentication failed: ${verifyError.message}`);
    }
  }, [verifyError]);

  // Handle signing errors
  useEffect(() => {
    if (signError) {
      console.error('Signing error:', signError);
      setPendingNonce(null);
      alert(`Signing failed: ${signError.message}`);
    }
  }, [signError]);


  const logout = () => {
    localStorage.removeItem('authToken');
    setAuthenticated(false);
    setUser(null);
  };

  const signAndLogin = async () => {
    if (!address) return;

    try {
      // Get nonce from backend using React Query
      const { data } = await getNonce();
      const { nonce } = data;

      // Store nonce for later use
      setPendingNonce(nonce);

      // Create message to sign
      const message = `Sign this message to authenticate: ${nonce}`;

      console.log('Requesting signature for message:', message);

      // Trigger the signing process - this will show MetaMask popup
      signMessage({ message });

    } catch (error) {
      console.error('Error getting nonce:', error);
      alert(`Error getting nonce: ${error.message}`);
    }
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      user,
      logout,
      signAndLogin,
      isSigning,
      isVerifying,
      isNonceLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};
