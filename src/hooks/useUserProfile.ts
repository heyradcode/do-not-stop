import { useQuery } from '@tanstack/react-query';
import axios, { AxiosError } from 'axios';

import { API_URL } from '../config';

// Get user profile
export const useUserProfile = () => {
  const token = localStorage.getItem('authToken');
  
  return useQuery({
    queryKey: ['user', 'profile'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_URL}/api/protected/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      return data;
    },
    enabled: !!token, // Only run if token exists
    retry: (failureCount, error: AxiosError) => {
      // Don't retry on 401 (unauthorized)
      if (error.response?.status === 401) {
        localStorage.removeItem('authToken');
        return false;
      }
      return failureCount < 3;
    },
  });
};
