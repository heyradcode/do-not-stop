import React from 'react';
import { useUserProfile } from '../hooks/useUser';
import './ProtectedRoute.css';

interface User {
  address: string;
  createdAt: string;
  lastLogin: string;
}

const ProtectedRoute: React.FC = () => {
  const { data: profileData, isLoading, error, refetch } = useUserProfile();
  const user = profileData?.user || null;

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className="protected-route">
        <h2>Protected Route</h2>
        <div className="loading">Loading user profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="protected-route">
        <h2>Protected Route</h2>
        <div className="error">
          <p>❌ Error: {error.message}</p>
          <button onClick={handleRefresh} className="refresh-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="protected-route">
      <h2>🔒 Protected Route</h2>
      <p className="success">✅ Successfully authenticated with JWT!</p>
      
      {user && (
        <div className="user-profile">
          <h3>User Profile</h3>
          <div className="profile-item">
            <strong>Address:</strong> {user.address}
          </div>
          <div className="profile-item">
            <strong>Account Created:</strong> {new Date(user.createdAt).toLocaleString()}
          </div>
          <div className="profile-item">
            <strong>Last Login:</strong> {new Date(user.lastLogin).toLocaleString()}
          </div>
        </div>
      )}
      
      <button onClick={handleRefresh} className="refresh-button">
        Refresh Profile
      </button>
    </div>
  );
};

export default ProtectedRoute;
