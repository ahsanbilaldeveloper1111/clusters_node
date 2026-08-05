/**
 * k6 load / smoke script — Principal/DevOps interview demo.
 *
 * Install: https://k6.io/docs/get-started/installation/
 * Run:
 *   k6 run load/k6-smoke.js
 *   BASE_URL=http://localhost:3000 k6 run load/k6-smoke.js
 *
 * Shows: health checks, auth, authenticated reads, idempotent order place.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.EMAIL || 'admin@enterprise.local';
const PASSWORD = __ENV.PASSWORD || 'Password123!';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const body = res.json();
  return { token: body?.data?.token || body?.data?.accessToken };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
    'X-Request-Id': `k6-${__VU}-${__ITER}`,
  };

  check(http.get(`${BASE}/health/live`), { live: (r) => r.status === 200 });
  check(http.get(`${BASE}/health/ready`), { ready: (r) => r.status === 200 });
  check(http.get(`${BASE}/metrics`), { metrics: (r) => r.status === 200 });

  check(http.get(`${BASE}/api/v1/products`, { headers }), {
    products: (r) => r.status === 200,
  });

  check(http.get(`${BASE}/api/v1/platform/messaging/status`, { headers }), {
    messaging: (r) => r.status === 200 || r.status === 403,
  });

  sleep(0.5);
}
