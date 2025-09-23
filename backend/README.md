# Backend - Web3 Authentication API

This is the Node.js backend for the Web3 authentication demo.

## Features

- **Nonce Generation**: Generates unique nonces for message signing
- **Signature Verification**: Verifies Ethereum signatures using ethers.js
- **JWT Authentication**: Issues JWT tokens upon successful verification
- **Protected Routes**: Example protected endpoints that require JWT
- **User Management**: Simple in-memory user storage (use database in production)

## API Endpoints

### Authentication
- `GET /api/auth/nonce` - Get a nonce for signing
- `POST /api/auth/verify` - Verify signature and get JWT token

### Protected Routes
- `GET /api/protected/profile` - Get user profile (requires JWT)
- `GET /api/users` - Get all users (requires JWT)

### Health Check
- `GET /api/health` - Server health status

## Setup

1. **Install dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Set environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your JWT secret
   ```

3. **Start the server**:
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

The server will run on `http://localhost:3001`

## Environment Variables

- `JWT_SECRET`: Secret key for JWT signing (required)
- `PORT`: Server port (default: 3001)

## How It Works

1. Frontend requests a nonce from `/api/auth/nonce`
2. User signs a message containing the nonce
3. Frontend sends address, signature, and nonce to `/api/auth/verify`
4. Backend verifies the signature matches the address
5. If valid, backend issues a JWT token
6. Frontend uses JWT token for authenticated requests
