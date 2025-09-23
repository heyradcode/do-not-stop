import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for demo (use database in production)
const users = new Map();

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Generate nonce for signing
app.get('/api/auth/nonce', (req, res) => {
  const nonce = Math.random().toString(36).substring(2, 15) + 
                Math.random().toString(36).substring(2, 15);
  
  res.json({ nonce });
});

// Verify signature and issue JWT
app.post('/api/auth/verify', async (req, res) => {
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
      JWT_SECRET,
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

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Protected route example
app.get('/api/protected/profile', verifyToken, (req, res) => {
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
app.get('/api/users', verifyToken, (req, res) => {
  const userList = Array.from(users.values());
  res.json({
    success: true,
    users: userList,
    total: userList.length
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: users.size
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
