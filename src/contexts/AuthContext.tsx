import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAccount } from 'wagmi';

interface User {
  address: string;
  createdAt: string;
  lastLogin: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  setAuthenticated: (authenticated: boolean, user?: User | null) => void;
  logout: () => void;
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check if user is authenticated - requires both token AND wallet connection
    const token = localStorage.getItem('authToken');
    const hasToken = !!token;
    const isWalletConnected = isConnected && !!address;
    
    const shouldBeAuthenticated = hasToken && isWalletConnected;
    
    setIsAuthenticated(shouldBeAuthenticated);
    
    // If wallet is disconnected, clear authentication state
    if (!isWalletConnected) {
      setUser(null);
    }
  }, [address, isConnected]);

  const setAuthenticated = (authenticated: boolean, userData?: User | null) => {
    setIsAuthenticated(authenticated);
    if (userData) {
      setUser(userData);
    } else if (!authenticated) {
      setUser(null);
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, setAuthenticated, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
