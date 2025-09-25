import React from 'react';

import { useUserProfile } from '../hooks/useUserProfile';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { data: profileData, isLoading, error, refetch } = useUserProfile();
  const user = profileData?.user || null;

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="protected-content">
      <h2>
        {isLoading || error ? "Protected Content" : "🔒 Protected Content"}
      </h2>
      {isLoading ? (
        <div className="loading">Loading user profile...</div>
      ) : error ? (
        <div className="error">
          <p>❌ Error: {error.message}</p>
          <button onClick={handleRefresh} className="refresh-button">
            Try Again
          </button>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};

export default Dashboard;
