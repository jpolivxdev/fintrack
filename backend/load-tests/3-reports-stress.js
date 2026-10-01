// Scenario 3 — stress on the aggregation endpoints for a user with 100k
// transactions (heavy@fintrack.dev). Used to measure before/after indexes.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, clientIp, headers, login } from './lib.js';
import { compactSummary } from './summary.js';

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    reports: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:GET /reports/summary}': ['p(95)<500'],
    'http_req_duration{name:GET /reports/monthly}': ['p(95)<500'],
    'http_req_duration{name:GET /reports/by-category}': ['p(95)<500'],
    'http_req_duration{name:GET /reports/budget-vs-actual}': ['p(95)<500'],
  },
};

const ENDPOINTS = [
  ['GET /reports/summary', '/reports/summary?year=2026&month=9'],
  ['GET /reports/monthly', '/reports/monthly?year=2026&month=9&months=12'],
  ['GET /reports/by-category', '/reports/by-category?startDate=2026-01-01&endDate=2026-09-30'],
  ['GET /reports/budget-vs-actual', '/reports/budget-vs-actual?year=2026&month=9'],
];

export function setup() {
  return { token: login('heavy@fintrack.dev', clientIp(20_000)) };
}

export default function ({ token }) {
  for (const [name, path] of ENDPOINTS) {
    const res = http.get(`${BASE_URL}${path}`, {
      headers: headers(token, clientIp(__VU)),
      tags: { name },
    });
    check(res, { [`${name} 200`]: (r) => r.status === 200 });
  }
}

export const handleSummary = compactSummary(__ENV.LABEL || '3-reports-stress');
