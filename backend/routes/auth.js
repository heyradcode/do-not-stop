import express from 'express';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';

const router = express.Router();


// In-memory storage for demo (use database in production)
const users = new Map();

// Generate nonce for signing
router.get('/nonce', (req, res) => {
  const nonce = Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  res.json({ nonce });
});

// Verify signature and issue JWT
router.post('/verify', async (req, res) => {
  try {
    const { address, signature, nonce } = req.body;

    if (!address || !signature || !nonce) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Recover the address from the signature
    const message = `Sign this message to authenticate: ${nonce}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Check if user exists or create new one
    let user = users.get(address.toLowerCase());
    if (!user) {
      user = {
        address: address.toLowerCase(),
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      users.set(address.toLowerCase(), user);
    } else {
      user.lastLogin = new Date().toISOString();
      users.set(address.toLowerCase(), user);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        address: address.toLowerCase(),
        userId: address.toLowerCase()
      },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        address: user.address,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });

  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { users };
export default router;
