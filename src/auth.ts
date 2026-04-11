import { SQLiteStorage } from './storage.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  userId: string; // Links to the DNA users table
  createdAt: number;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
  revoked: boolean;
}

export interface JWTPayload {
  userId: string;
  authUserId: string;
  email: string;
  name: string;
  type: 'access' | 'refresh';
}

export class AuthManager {
  private storage: SQLiteStorage;
  private jwtSecret: string;
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;
  private readonly BCRYPT_ROUNDS = 10;

  constructor(storage: SQLiteStorage, jwtSecret?: string) {
    this.storage = storage;

    if (jwtSecret) {
      this.jwtSecret = jwtSecret;
    } else {
      this.jwtSecret = this.loadOrGenerateJWTSecret();
    }

    this.initTables();
  }

  private loadOrGenerateJWTSecret(): string {
    const secretPath = path.join(process.cwd(), 'data', 'jwt-secret.txt');
    const secretDir = path.dirname(secretPath);

    if (!fs.existsSync(secretDir)) {
      fs.mkdirSync(secretDir, { recursive: true });
    }

    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf-8').trim();
    }

    const secret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretPath, secret, 'utf-8');
    console.log('🔐 Generated new JWT secret at', secretPath);
    return secret;
  }

  private initTables(): void {
    const db = this.storage.getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES auth_users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    `);
  }

  async register(email: string, password: string, name: string): Promise<{
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
  }> {
    const db = this.storage.getDb();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM auth_users WHERE email = ?').get(email);
    if (existing) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.BCRYPT_ROUNDS);

    // Create DNA user (in the existing users table)
    const dnaUserId = uuid();
    const now = Date.now();
    db.prepare('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)').run(
      dnaUserId,
      name,
      email,
      now
    );

    // Create auth user
    const authUserId = uuid();
    db.prepare(`
      INSERT INTO auth_users (id, email, password_hash, name, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(authUserId, email, passwordHash, name, dnaUserId, now);

    const user: AuthUser = {
      id: authUserId,
      email,
      name,
      userId: dnaUserId,
      createdAt: now,
    };

    const { accessToken, refreshToken } = await this.generateTokens(user);

    return { user, accessToken, refreshToken };
  }

  async login(email: string, password: string): Promise<{
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
  }> {
    const db = this.storage.getDb();

    const row = db.prepare(`
      SELECT id, email, password_hash, name, user_id, created_at
      FROM auth_users
      WHERE email = ?
    `).get(email) as any;

    if (!row) {
      throw new Error('Invalid email or password');
    }

    const isValid = await bcrypt.compare(password, row.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      userId: row.user_id,
      createdAt: row.created_at,
    };

    const { accessToken, refreshToken } = await this.generateTokens(user);

    return { user, accessToken, refreshToken };
  }

  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // Verify the refresh token
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as JWTPayload;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if token exists and is not revoked
      const db = this.storage.getDb();
      const tokenHash = this.hashToken(refreshToken);
      const tokenRecord = db.prepare(`
        SELECT * FROM refresh_tokens
        WHERE token_hash = ? AND user_id = ? AND revoked = 0 AND expires_at > ?
      `).get(tokenHash, decoded.authUserId, Date.now()) as any;

      if (!tokenRecord) {
        throw new Error('Invalid or expired refresh token');
      }

      // Get user
      const userRow = db.prepare(`
        SELECT id, email, name, user_id, created_at
        FROM auth_users
        WHERE id = ?
      `).get(decoded.authUserId) as any;

      if (!userRow) {
        throw new Error('User not found');
      }

      const user: AuthUser = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        userId: userRow.user_id,
        createdAt: userRow.created_at,
      };

      // Revoke old refresh token
      db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(tokenRecord.id);

      // Generate new tokens (rotation)
      const newTokens = await this.generateTokens(user);

      return newTokens;
    } catch (err: any) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const db = this.storage.getDb();
      const tokenHash = this.hashToken(refreshToken);
      db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
    } catch (err) {
      // Silently fail - token might already be invalid
    }
  }

  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (err: any) {
      throw new Error('Invalid or expired access token');
    }
  }

  getUserFromToken(token: string): AuthUser | null {
    try {
      const decoded = this.verifyAccessToken(token);
      const db = this.storage.getDb();
      const row = db.prepare(`
        SELECT id, email, name, user_id, created_at
        FROM auth_users
        WHERE id = ?
      `).get(decoded.authUserId) as any;

      if (!row) return null;

      return {
        id: row.id,
        email: row.email,
        name: row.name,
        userId: row.user_id,
        createdAt: row.created_at,
      };
    } catch (err) {
      return null;
    }
  }

  private async generateTokens(user: AuthUser): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessPayload: JWTPayload = {
      userId: user.userId,
      authUserId: user.id,
      email: user.email,
      name: user.name,
      type: 'access',
    };

    const refreshPayload: JWTPayload = {
      userId: user.userId,
      authUserId: user.id,
      email: user.email,
      name: user.name,
      type: 'refresh',
    };

    const accessToken = jwt.sign(accessPayload, this.jwtSecret, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(refreshPayload, this.jwtSecret, {
      expiresIn: `${this.REFRESH_TOKEN_EXPIRY_DAYS}d`,
    });

    // Store refresh token
    const db = this.storage.getDb();
    const tokenHash = this.hashToken(refreshToken);
    const now = Date.now();
    const expiresAt = now + this.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(uuid(), user.id, tokenHash, expiresAt, now);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Clean up expired tokens
  cleanupExpiredTokens(): number {
    const db = this.storage.getDb();
    const result = db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(Date.now());
    return result.changes;
  }
}
