import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';

// Get nonce for signing
export const useNonce = () => {
  return useQuery({
    queryKey: ['nonce'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_URL}/api/auth/nonce`);
      return data;
    },
    enabled: false, // Only run when manually triggered
    staleTime: 0, // Always fetch fresh nonce
  });
};

// Verify signature and get JWT token
export const useVerifySignature = () => {
  return useMutation({
    mutationFn: async ({ address, signature, nonce }: {
      address: string;
      signature: string;
      nonce: string;
    }) => {
      const { data } = await axios.post(`${API_URL}/api/auth/verify`, {
        address,
        signature,
        nonce,
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        localStorage.setItem('authToken', data.token);
      }
    },
  });
};
