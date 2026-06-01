import type { Request } from 'express';

export interface User {
    address: string;
    createdAt: string;
    lastLogin: string;
}

export interface AuthVerifyBody {
    address: string;
    signature: string;
    nonce: string;
    chainId?: number;
}

export interface AuthVerifyRequest extends Request {
    body: AuthVerifyBody;
}

export interface NonceResponse {
    nonce: string;
}

export interface VerifyResponse {
    success: boolean;
    token: string;
    user: {
        address: string;
        createdAt: string;
        lastLogin: string;
    };
}

export interface AuthErrorResponse {
    error: string;
}
