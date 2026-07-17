import { pool } from '../database/pool.js';

export default async function globalTeardown(): Promise<void> {
  await pool.end();
}
