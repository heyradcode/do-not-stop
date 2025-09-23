import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useNonce, useVerifySignature } from '../hooks/useAuth';

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
  const { address, isConnected } = useAccount();
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [pendingNonce, setPendingNonce] = useState<string | null>(null);

  // React Query hooks
  const { refetch: getNonce, isLoading: isNonceLoading } = useNonce();
  const { mutate: verifySignature, isPending: isVerifying, data: authData, error: verifyError } = useVerifySignature();
  const { signMessage, isPending: isSigning, data: signature, error: signError } = useSignMessage();

  useEffect(() => {
    // Check if user is authenticated - requires both token AND wallet connection
    const token = localStorage.getItem('authToken');
    const hasToken = !!token;
    const isWalletConnected = isConnected && !!address;
    
    const shouldBeAuthenticated = hasToken && isWalletConnected;
    
    setAuthenticated(shouldBeAuthenticated);
    
    // If wallet is disconnected, clear authentication state and token
    if (!isWalletConnected) {
      setUser(null);
      // Clear token when wallet is disconnected for security
      localStorage.removeItem('authToken');
    }
  }, [address, isConnected]);

  // Handle signature completion
  useEffect(() => {
    if (signature && pendingNonce && address) {
      verifySignature({
        address,
        signature,
        nonce: pendingNonce,
      });
    }
  }, [signature, pendingNonce, address, verifySignature]);

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
      alert('Authentication failed: ' + verifyError.message);
    }
  }, [verifyError]);

  // Handle signing errors
  useEffect(() => {
    if (signError) {
      console.error('Signing error:', signError);
      setPendingNonce(null);
      alert('Signing failed: ' + signError.message);
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
      alert('Error getting nonce: ' + error.message);
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
