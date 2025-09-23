import React, { useState, useEffect } from 'react';
import './ProtectedRoute.css';

interface User {
  address: string;
  createdAt: string;
  lastLogin: string;
}

const ProtectedRoute: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        setError('No authentication token found');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('http://localhost:3001/api/protected/profile', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user profile');
        }

        const data = await response.json();
        setUser(data.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        // Clear invalid token
        localStorage.removeItem('authToken');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    
    const token = localStorage.getItem('authToken');
    if (!token) {
      setError('No authentication token found');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/protected/profile', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const data = await response.json();
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
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
          <p>❌ Error: {error}</p>
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
