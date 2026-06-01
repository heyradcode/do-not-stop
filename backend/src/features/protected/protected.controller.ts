import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@middleware/auth';
import { getUserProfile, listUsers } from './protected.service';
import type { ProfileResponse, ProtectedErrorResponse, UsersResponse } from './protected.types';

export function getProfile(
    req: Request,
    res: Response<ProfileResponse | ProtectedErrorResponse>
): void {
    const authReq = req as AuthenticatedRequest;
    const user = getUserProfile(authReq.user?.address || '');

    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }

    res.json({
        success: true,
        user: {
            address: user.address,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
        },
    });
}

export function getUsers(_req: Request, res: Response<UsersResponse>): void {
    const userList = listUsers();
    res.json({
        success: true,
        users: userList,
        total: userList.length,
    });
}
