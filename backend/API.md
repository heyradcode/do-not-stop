# API Documentation

## Base URL
```
http://localhost:3001
```

> **Note**: The backend runs on port 3001, not 3000. This is configured in the backend's `server.js` file.

## 🚀 Quick Start

The backend is part of the automated development workflow. From the project root:

```bash
# Start everything (backend + frontend + contracts)
pnpm dev:full

# Or start backend only
pnpm dev:backend
```

## Endpoints

### Root
```http
GET /
```
Returns API information and available endpoints.

**Response:**
```json
{
  "message": "Web3 Authentication API",
  "version": "1.0.0",
  "endpoints": {
    "auth": "/api/auth",
    "protected": "/api/protected",
    "health": "/api/health"
  }
}
```

### Authentication

#### Get Nonce
```http
GET /api/auth/nonce
```
Gets a unique nonce for message signing.

**Response:**
```json
{
  "nonce": "abc123def456"
}
```

#### Verify Signature
```http
POST /api/auth/verify
```
Verifies signature and issues JWT token.

**Request Body:**
```json
{
  "address": "0x...",
  "signature": "0x...",
  "nonce": "abc123def456"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "address": "0x...",
    "createdAt": "2025-01-27T...",
    "lastLogin": "2025-01-27T..."
  }
}
```

### Protected Routes

All protected routes require JWT token in Authorization header:
```
Authorization: Bearer <jwt-token>
```

#### Get User Profile
```http
GET /api/protected/profile
```

**Response:**
```json
{
  "success": true,
  "user": {
    "address": "0x...",
    "createdAt": "2025-01-27T...",
    "lastLogin": "2025-01-27T..."
  }
}
```

#### Get All Users
```http
GET /api/protected/users
```

**Response:**
```json
{
  "success": true,
  "users": [...],
  "total": 5
}
```

### Health Check

#### Server Status
```http
GET /api/health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-01-27T...",
  "users": 3
}
```
