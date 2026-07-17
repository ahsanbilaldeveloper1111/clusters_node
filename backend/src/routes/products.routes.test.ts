import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('Products API', () => {
  it('GET /api/products returns a list', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/products/search requires query', async () => {
    const res = await request(app).get('/api/products/search');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
