# JWT Authentication System

## Overview

A full JWT-based authentication system has been added to the AgentDNA project. All API endpoints (except public ones) now require authentication.

## Features

### Backend (TypeScript/Express)

#### New File: `src/auth.ts`
- **AuthManager** class that handles:
  - User registration with bcrypt password hashing (10 rounds)
  - Login with email/password
  - JWT access token generation (15 min expiry)
  - JWT refresh token generation with rotation (7 day expiry)
  - Token verification and user retrieval
  - Logout with refresh token revocation
  
#### Database Tables
- **auth_users**: Stores authentication credentials
  - `id` (TEXT PK) - auth user ID
  - `email` (TEXT UNIQUE) - user email
  - `password_hash` (TEXT) - bcrypted password
  - `name` (TEXT) - user's name
  - `user_id` (TEXT FK) - links to DNA `users` table
  - `created_at` (INTEGER) - timestamp
  
- **refresh_tokens**: Stores refresh tokens
  - `id` (TEXT PK)
  - `user_id` (TEXT FK) - links to auth_users
  - `token_hash` (TEXT) - SHA256 hash of token
  - `expires_at` (INTEGER)
  - `created_at` (INTEGER)
  - `revoked` (INTEGER) - 0/1 flag

#### JWT Secret
- Read from `JWT_SECRET` environment variable
- If not set, generates random secret and stores in `data/jwt-secret.txt`
- Uses HS256 algorithm

### API Endpoints

#### Public Endpoints (No Auth Required)
- `GET /` - Dashboard HTML
- `GET /api/stats` - Public stats
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout (revokes refresh token)
- Static files

#### Protected Endpoints (Require Bearer Token)
All other endpoints now require `Authorization: Bearer <access_token>` header:
- `/api/auth/me` - Get current user info
- `/api/agents/*` - Agent operations (scoped to user's agents)
- `/api/entries/*` - DNA entries (scoped to user's agents)
- `/api/recall` - Recall knowledge (scoped to user's agents)
- `/api/profile` - Agent profiles (scoped to user's agents)
- `/api/onboard` - Agent onboarding (scoped to user's agents)
- `/api/users/*` - User operations (scoped to self and friends)
- `/api/friendships` - Friend management (scoped to user)
- `/api/messages` - Messages (scoped to user)
- `/api/feed` - Activity feed (scoped to user)

#### Authentication Flow
```
1. Register: POST /api/auth/register
   Body: { email, password, name }
   Response: { ok, user, accessToken, refreshToken }

2. Login: POST /api/auth/login
   Body: { email, password }
   Response: { ok, user, accessToken, refreshToken }

3. Access Protected API:
   Header: Authorization: Bearer <accessToken>

4. Refresh Token (when accessToken expires):
   POST /api/auth/refresh
   Body: { refreshToken }
   Response: { ok, accessToken, refreshToken } (new tokens)

5. Logout:
   POST /api/auth/logout
   Body: { refreshToken }
   Response: { ok }
```

### Frontend (public/index.html)

#### Login/Register Modal
- Shows automatically if not authenticated
- Toggle between login and register forms
- Stores JWT tokens in localStorage
- Displays user email in header when logged in

#### Auth State Management
- `authState` object stores: accessToken, refreshToken, user
- Persisted to localStorage
- Loaded on page refresh

#### Enhanced Fetch
- `authFetch()` function wraps all API calls
- Automatically adds `Authorization: Bearer <token>` header
- Handles 401 responses by attempting token refresh
- Automatically logs out if refresh fails

#### Auto-Refresh
- When API returns 401, attempts to refresh access token
- If refresh succeeds, retries original request with new token
- If refresh fails, logs user out and shows login modal

## Security Features

1. **Password Hashing**: bcrypt with 10 rounds
2. **Token Security**: 
   - Short-lived access tokens (15 min)
   - Refresh tokens stored as SHA256 hashes
   - Refresh token rotation on use
3. **HTTP-Only Best Practice**: Tokens in localStorage (consider httpOnly cookies for production)
4. **CORS Enabled**: Configured for cross-origin requests
5. **Token Revocation**: Refresh tokens can be revoked on logout
6. **Foreign Key Constraints**: Database integrity maintained
7. **SQL Injection Protection**: Prepared statements via better-sqlite3

## Data Scoping

All API access is now scoped to the authenticated user:
- Users can only see/modify their own agents
- Users can only see/modify entries from their agents
- Users can only see friends and friends' data
- Messages scoped to user's agents
- Feed scoped to user's activity

## Usage Example

```bash
# Register
curl -X POST http://localhost:3456/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass123","name":"John Doe"}'

# Login
curl -X POST http://localhost:3456/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass123"}'

# Access Protected Endpoint
TOKEN="<accessToken from login>"
curl -X GET http://localhost:3456/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Register Agent (automatically linked to authenticated user)
curl -X POST http://localhost:3456/api/agents/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"MyAgent"}'
```

## Environment Variables

- `JWT_SECRET` (optional): Custom JWT secret. If not set, auto-generated and stored in `data/jwt-secret.txt`

## Dependencies

Already installed in package.json:
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT token generation and verification
- `@types/bcryptjs` - TypeScript types
- `@types/jsonwebtoken` - TypeScript types

## TypeScript

All code is fully typed with strict TypeScript. The `Express.Request` interface is extended to include an optional `user` property for authenticated requests.

## Testing

Run the server:
```bash
npm start
```

Visit http://localhost:3456 - you'll see the login modal. Register a new account, then explore the authenticated dashboard.
