import express from 'express';
import jwt from 'jsonwebtoken';
import { users } from './auth.js';

const router = express.Router();

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Apply JWT verification to all protected routes
router.use(verifyToken);

// Protected route example
router.get('/profile', (req, res) => {
  const user = users.get(req.user.address);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    success: true,
    user: {
      address: user.address,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }
  });
});

// Get all users (for demo purposes)
router.get('/users', (req, res) => {
  const userList = Array.from(users.values());
  res.json({
    success: true,
    users: userList,
    total: userList.length
  });
});

export default router;
