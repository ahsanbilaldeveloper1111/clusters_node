import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('Auth API', () => {
  let refreshToken: string;

  it('POST /api/auth/login rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login returns tokens for seeded admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@enterprise.local', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.role).toBe('admin');
    refreshToken = res.body.data.refreshToken;
  });

  it('POST /api/auth/refresh rotates tokens', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });
});
