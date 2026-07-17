import type { UserRole } from './advanced.js';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  category: string | null;
  attributes: Record<string, unknown>;
  version?: number;
}

export interface Order {
  id: string;
  user_id: string;
  status: string;
  total_amount: string;
  created_at: string;
}

export interface AuthPayload {
  token: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: string;
  user: User;
}

export interface SystemInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpus: number;
  memory: Record<string, number>;
  cluster: {
    isPrimary: boolean;
    workerId: string | null;
  };
}

export interface HealthStatus {
  status: string;
  checks: { database: boolean; redis: boolean };
  worker: { pid: number; isPrimary: boolean; workerId: string | null };
  uptime: number;
}

export interface CpuTaskResult {
  task: string;
  result: unknown;
  durationMs: number;
  workerThread: boolean;
}

export interface LastCalledAtRow {
  remote_party_number: string;
  last_called_at: string | null;
}

export interface CallCountResult {
  call_count: number;
  filter_count: number;
}
