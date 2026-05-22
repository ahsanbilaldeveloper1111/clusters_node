import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { logger } from '../utils/logger.js';

const DEFAULT_PASSWORD = 'Password123!';

async function seed(): Promise<void> {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, metadata)
     VALUES
       ('admin@enterprise.local', $1, 'System Admin', 'admin', '{"department": "IT"}'),
       ('manager@enterprise.local', $1, 'Sales Manager', 'manager', '{"department": "Sales"}'),
       ('customer@enterprise.local', $1, 'Jane Customer', 'customer', '{"tier": "gold"}')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [hash]
  );

  await pool.query(
    `INSERT INTO products (sku, name, description, price, stock, category, attributes)
     VALUES
       ('SKU-001', 'Enterprise Laptop', 'High-performance dev machine', 1899.99, 50, 'Electronics', '{"brand": "TechCorp"}'),
       ('SKU-002', 'Wireless Keyboard', 'Mechanical RGB keyboard', 149.99, 200, 'Electronics', '{"brand": "KeyMax"}'),
       ('SKU-003', 'Standing Desk', 'Electric height-adjustable desk', 599.00, 30, 'Furniture', '{}'),
       ('SKU-004', 'Monitor 27"', '4K IPS display', 449.99, 75, 'Electronics', '{}'),
       ('SKU-005', 'USB-C Hub', '7-in-1 adapter', 79.99, 150, 'Accessories', '{}')
     ON CONFLICT (sku) DO NOTHING`
  );

  logger.info('Seed completed. Default password: Password123!');
  await pool.end();
}

seed().catch((err) => {
  logger.error(err);
  process.exit(1);
});
