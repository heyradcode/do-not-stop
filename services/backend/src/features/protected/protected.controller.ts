import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@middleware/auth';
import { getUserProfile, listUsers } from './protected.service';
import type { ProfileResponse, ProtectedErrorResponse, UsersResponse } from './protected.types';

export async function getProfile(
    req: Request,
    res: Response<ProfileResponse | ProtectedErrorResponse>
): Promise<void> {
    try {
        const authReq = req as AuthenticatedRequest;
        const user = await getUserProfile(authReq.user?.address || '');

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
    } catch (err) {
        console.error('[protected] profile lookup failed:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function getUsers(
    _req: Request,
    res: Response<UsersResponse | ProtectedErrorResponse>
): Promise<void> {
    try {
        const userList = await listUsers();
        res.json({
            success: true,
            users: userList,
            total: userList.length,
        });
    } catch (err) {
        console.error('[protected] user list failed:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
