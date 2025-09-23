import express from 'express';
import { users } from './auth.js';

const router = express.Router();

// Health check
router.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: users.size
  });
});

export default router;
