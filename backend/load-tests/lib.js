// Shared helpers for the k6 scenarios.
import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
export const PASSWORD = 'LoadTest@123';
export const LOAD_USERS = 50;

/**
 * Each virtual user behaves like a distinct client behind the proxy, so the
 * per-IP rate limits apply per VU (as in production) instead of to the
 * whole test. Requires the API to run with TRUST_PROXY_HOPS=1.
 */
export function clientIp(vu) {
  return `10.20.${Math.floor(vu / 250)}.${(vu % 250) + 1}`;
}

export function headers(token, ip) {
  const h = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function login(email, ip) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: headers(null, ip), tags: { name: 'POST /auth/login' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  return res.status === 200 ? res.json('accessToken') : null;
}

export function loadUserEmail(n) {
  return `loadtest-${((n - 1) % LOAD_USERS) + 1}@fintrack.dev`;
}
