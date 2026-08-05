export interface ProfileResponse {
    success: boolean;
    user: {
        address: string;
        createdAt: string;
        lastLogin: string;
    };
}

export interface UsersResponse {
    success: boolean;
    users: Array<{
        address: string;
        createdAt: string;
        lastLogin: string;
    }>;
    total: number;
}

export interface ProtectedErrorResponse {
    error: string;
}
